const { graphql } = require(`graphql`);
const { makeExecutableSchema } = require(`graphql-tools`);
const createInputResolvers = require(`../src/index.js`);
let success;

const typeDefs = `
    input TestInput {
        foo: String
    }

    type Query {
        test(input: TestInput!): String!
    }
`;

const schema = makeExecutableSchema({
    typeDefs,
    resolvers: createInputResolvers(typeDefs, {
        Query: {
            test: () => `Test Result`
        },
        TestInput: {
            foo: (source, args) => {
                console.log(`Input resolver executed`);
                console.dir({
                    source,
                    args
                });
                success = true;
            }
        }
    })
});

const query = `
    query {
        test(input: { foo: "FOO" })
    }
`;

(async function run() {
    console.dir(await graphql(schema, query));
    if (success) {
        console.log(`Test completed sucesfully`);
        process.exit(0);
    } else {
        console.log(`Test failed`);
        process.exit(1);
    }
}());
