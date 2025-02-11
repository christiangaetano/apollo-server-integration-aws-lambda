import type { IncomingMessage, Server, ServerResponse } from 'http';
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
  Context as LambdaContext,
  Handler,
} from 'aws-lambda';
import { format } from 'url';
import type { AddressInfo } from 'net';
import type { GatewayEvent } from '..';

type LambdaHandler<T = GatewayEvent> = Handler<
  T,
  T extends APIGatewayProxyEvent
    ? APIGatewayProxyResult
    : APIGatewayProxyStructuredResultV2
>;

// Returns a Node http handler that invokes a Lambda handler (v1 / v2)
export function createMockServer<T extends GatewayEvent>(
  handler: LambdaHandler<T>,
  eventFromRequest: (req: IncomingMessage, body: string) => T,
) {
  return (req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    // this is an unawaited async function, but anything that causes it to
    // reject should cause a test to fail
    req.on('end', async () => {
      const event = eventFromRequest(req, body);
      const result = await handler(
        event,
        { functionName: 'someFunc' } as LambdaContext, // we don't bother with all the fields
        () => {
          throw Error("we don't use callback");
        },
      )!;
      res.statusCode = result.statusCode!;
      Object.entries(result.headers ?? {}).forEach(([key, value]) => {
        res.setHeader(key, value.toString());
      });
      res.write(result.body);
      res.end();
    });
  };
}

// Stolen from apollo server integration tests
export function urlForHttpServer(httpServer: Server): string {
  const { address, port } = httpServer.address() as AddressInfo;

  // Convert IPs which mean "any address" (IPv4 or IPv6) into localhost
  // corresponding loopback ip. Note that the url field we're setting is
  // primarily for consumption by our test suite. If this heuristic is wrong for
  // your use case, explicitly specify a frontend host (in the `host` option
  // when listening).
  const hostname = address === '' || address === '::' ? 'localhost' : address;

  return format({
    protocol: 'http',
    hostname,
    port,
    pathname: '/',
  });
}
