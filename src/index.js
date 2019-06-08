import config from './mashup'
import http from "http";
import express from "express";
import {ApolloServer} from "apollo-server-express";

const PORT = process.env['PORT'] || 4000;
const app = express();

const {getSchema, ...rest} = config;

getSchema().then(schema => {
    const server = new ApolloServer({
        schema,
        ...rest,
    });
    server.applyMiddleware({app});

    const httpServer = http.createServer(app);
    server.installSubscriptionHandlers(httpServer);

    httpServer.listen(PORT, () => {
        console.log(`🚀 Server ready at http://localhost:${PORT}${server.graphqlPath}`);
        console.log(`🚀 Subscriptions ready at ws://localhost:${PORT}${server.subscriptionsPath}`)
    });
})
    .catch(v => console.error(v));
