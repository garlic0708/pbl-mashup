import {getServiceSchema, config} from 'pbl-lib'
import mergeSchemas from "graphql-tools/dist/stitching/mergeSchemas";
import jwkToPem from 'jwk-to-pem'
import {verify, decode} from 'jsonwebtoken'
import jwks from '../jwks'
import {promisify} from 'util'
import FormData from 'form-data'
import fetch from 'node-fetch'

const httpSchemas = ['user-project', 'resource', 'task'];
const wsSchemas = ['notification'];

async function getSchema() {
    const schemas = await Promise.all([
        ...wsSchemas.map(schemaName => getServiceSchema(schemaName, true)
            .catch(() => {
            })),
        ...httpSchemas.map(schemaName => getServiceSchema(schemaName)
            .catch(() => {
                console.log(schemaName, 'service not on')
            }))
    ]);
    return mergeSchemas({
        schemas: schemas.filter(s => s),
        resolvers: () => ({
            Mutation: {
                uploadResource: async (root, {project, fileName, content}, context) => {
                    const awaitContent = await content;
                    const body = new FormData();

                    body.append(
                        'operations',
                        JSON.stringify({
                            query: /* GraphQL */ `
        mutation($file: Upload!, $project: String!, $fileName: String!) {
          uploadFile(content: $file, project: $project, fileName: $fileName) {
            success
          }
        }
      `,
                            variables: {
                                file: null,
                                project,
                                fileName,
                            }
                        })
                    );

                    body.append('map', JSON.stringify({1: ['variables.file']}));
                    body.append('1', awaitContent.createReadStream());

                    console.log('service', config.services['resource']);
                    const result = await fetch(`http://${config.services['resource']}/graphql`, {method: 'POST', body});
                    console.log('result', result);
                    return result
                }
            }
        })
    })
}

function pemFactory(keyId) {
    return jwkToPem(jwks.keys.filter(({kid}) => kid === keyId)[0])
}

async function verifyJwt(token, algorithms = ['RS256']) {
    const {header: {kid}} = decode(token, {complete: true});
    return promisify(verify)(token, pemFactory(kid), {algorithms})
}

export default {
    getSchema,
    subscriptions: {
        onConnect: params => {
            console.log('ws params', params);
            return {authToken: params['authToken']};
        }
    },
    context: async (ctx) => {
        const accessToken = ctx.req ? ctx.req.headers?.authorization?.split(' ')[1]
            : ctx.connection.context['authToken'];
        console.log('token', accessToken);
        if (!ctx.req) console.log(ctx.connection);
        let newCtx;
        try {
            const payload = await verifyJwt(accessToken);
            newCtx = {username: payload['cognito:username'] || payload.username}
        } catch (e) {
            newCtx = {}
        }
        if (ctx.req) newCtx.request = ctx.req;
        return newCtx
    },
    formatError: error => {
        console.log(error, error?.extensions.exception.stacktrace);
        return error;
    },
    formatResponse: response => {
        console.log(response);
        return response;
    },
}
