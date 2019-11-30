module.exports = createInputResolvers;

const { parse, isType, isInputObjectType } = require(`graphql`);

function createInputResolvers(typeDefs, resolvers) {
    if (Array.isArray(typeDefs)) {
        typeDefs = typeDefs.join(`\n`);
    }
    if (typeof typeDefs === `string`) {
        typeDefs = parse(typeDefs);
    }
    if (!typeDefs || typeDefs.kind !== `Document`) {
        throw new Error(`Expected typeDefs to be supplied and be a document AST node`);
    }

    const inputTypes = typeDefs.definitions
        .filter(definition => definition.kind === `InputObjectTypeDefinition`)
        .map(definition => definition.name.value);

    Object.keys(resolvers)
        .filter(typeName => !isType(resolvers[typeName]))
        .forEach(typeName => {
            resolvers[typeName] = Object.keys(resolvers[typeName]).reduce((result, fieldName) => {
                result[fieldName] = createInputResolver(resolvers[typeName][fieldName]);
                return result;
            }, {});
        });

    const result = {
        ...resolvers
    };
    inputTypes.forEach(typeName => {
        delete result[typeName];
    });
    return result;

    function createInputResolver(resolver) {
        return async function inputResolver(source, args, context, info) {
            if (!info.transaction) {
                info = {
                    ...info,
                    transaction
                };
            }
            const protections = [];
            try {
                const result = await resolver(source, args, context, info);

                const field = info.parentType.getFields()[info.fieldName];
                if (Array.isArray(field.args)) {
                    await Promise.all(
                        field.args.filter(arg => arg.name in args)
                            .map(arg => processType(arg.type, args[arg.name]))
                    );
                }

                return result;
            } catch (ex) {
                try {
                    await rollback(source, args, context, info);
                } catch (rollbackEx) {
                    ex.rollbackErrors = rollbackEx;
                }
                throw ex;
            }

            async function transaction(handler, rollback) {
                const result = await handler();
                if (typeof rollback === `function`) {
                    protections.push(() => rollback(result));
                }
                return result;
            }

            async function rollback(result) {
                let rollbackErrors = await Promise.all(
                    protections.map(executeRollback)
                );
                protections.length = 0;

                rollbackErrors = rollbackErrors.filter(err => err);
                if (rollbackErrors.length === 1) {
                    throw rollbackErrors[0];
                } else if (rollbackErrors.length > 1) {
                    const err = new Error(`Errors occured during rollback. ${rollbackErrors.map(rbe => rbe.message)}`);
                    throw err;
                }

                async function executeRollback(rollbackHandler) {
                    try {
                        await rollbackHandler(result);
                        return undefined;
                    } catch (ex) {
                        return ex;
                    }
                }
            }

            // Note: We execute 1 level deep here. Since any deeper level resolvers
            //  will do their own execution 1 level deep, we end up with a natural
            //  recursion

            // Recursively process args
            //  Is object a type that exists on resolvers
            //      Yes -> For every defined resolver exec using result as source
            //              TODO: Any way to add these results to the final one if there
            //                      are resolvers defined to re-look them up?
            //  For every property that is not defined in resolvers and also an InputObjectType
            //      Recursively execute, passing args.<property name> as the arguments to the resolver

            async function processType(type, args = Object.create(null)) {
                if (!type) {
                    return;
                }
                type = type.ofType || type;
                if (!isInputObjectType(type)) {
                    return;
                }

                const fields = type.getFields();
                if (resolvers[type.name]) {
                    // TODO: Would be nice if we could somehow store the result to return instead
                    //          of other resolvers re-querying the data source
                    await Promise.all(
                        Object.keys(resolvers[type.name])
                            .filter(key => typeof resolvers[type.name][key] === `function`)
                            .filter(key => key in args)
                            .map(async key => {
                                const subInfo = buildInfo(key, info, type, fields);
                                await resolvers[type.name][key](
                                    result,
                                    args[key],
                                    context,
                                    subInfo
                                );
                                delete fields[key];
                                return result;
                            })
                    );
                }

                await Promise.all(
                    Object.keys(fields).map(
                        key => processType(fields[key].type, args && args[key])
                    )
                );
            }

            function buildInfo(key, info, type, fields) {
                return {
                    fieldName: key,
                    parameter: true,
                    fieldNodes: info.fieldNodes,
                    returnType: fields[key].type,
                    parentType: type,
                    schema: info.schema,
                    fragments: info.fragments,
                    rootValue: info.rootValue,
                    operation: info.operation,
                    variableValues: info.variableValues,
                    path: {
                        prev: info.path,
                        key
                    }
                };
            }
        };
    }
}
