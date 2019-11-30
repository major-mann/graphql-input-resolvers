# GraphQL input resolvers
This package allows resolvers to be defined for input types

## Installation

    npm install graphql-input-resolvers

## Usage

````
input TestInput {
    foo: String
}

type Query {
    test(input: TestInput!): String!
}
````

````
query {
    test(input: { foo: "FOO" })
}
````

````
makeExecutableSchema({
    typeDefs,
    resolvers: createInputResolvers(typeDefs, {
        Query: {
            test: () => `Test Result`
        },
        TestInput: {
            foo: (source, args, context, info) => {
                // source -> The result of executing the test resolver (i.e. "Test Result")
                // args -> The "unwrapped" argument from recursive processing (i.e. "FOO")
                // context -> Same as was passed to the test resolver
                // info -> Constructed for resolver. Additional "parameter" property indicating
                //          the execution is taking place as part of parameter resolution
                console.log(`INPUT RESOLVER - This will be executed ` +
                    `if "foo" is included in the input type`);
                return `This result is not currently stored anywhere`;
            }
        }
    })
});
````

## Details
* Args are processed in parallel
* All properties with resolvers on each type are executed in parallel
* Once complete, any properties without resolvers are recursively processed
* No input resolver results are stored at this time

