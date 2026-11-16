import type { paths } from "./generated/openapi.js";

/** Every path template the API publishes, such as `"/emails/{id}"`. */
export type ApiPath = keyof paths;

/** The HTTP methods the API uses. */
export type HttpMethod = "get" | "put" | "post" | "delete" | "patch";

/** The methods a path actually defines. */
export type MethodOf<P extends ApiPath> = {
  [M in HttpMethod]: paths[P][M] extends undefined ? never : M;
}[HttpMethod];

type Operation<P extends ApiPath, M extends HttpMethod> = NonNullable<paths[P][M]>;

type JsonContent<R> = R extends { content: { "application/json": infer B } } ? B : never;

type SuccessStatus = 200 | 201 | 202 | 203 | 206;

/** The JSON request body of an operation. */
export type RequestBody<P extends ApiPath, M extends HttpMethod> =
  Operation<P, M> extends { requestBody?: infer RB } ? JsonContent<NonNullable<RB>> : never;

/** The query parameters of an operation. */
export type QueryParams<P extends ApiPath, M extends HttpMethod> =
  Operation<P, M> extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

/** The path parameters of an operation. */
export type PathParams<P extends ApiPath, M extends HttpMethod> =
  Operation<P, M> extends { parameters: { path?: infer A } } ? NonNullable<A> : never;

/** The union of an operation's 2xx JSON bodies (`never` when the API declares none). */
export type ResponseBody<P extends ApiPath, M extends HttpMethod> =
  Operation<P, M> extends { responses: infer R }
    ? { [S in keyof R]: S extends SuccessStatus ? JsonContent<R[S]> : never }[keyof R]
    : never;

/** One item of a list operation's `data` array. */
export type ListItem<P extends ApiPath, M extends HttpMethod = "get"> =
  ResponseBody<P, M> extends { data: (infer I)[] } ? I : never;
