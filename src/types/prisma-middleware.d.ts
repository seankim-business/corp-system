import "@prisma/client";

declare module "@prisma/client" {
  export namespace Prisma {
    export type MiddlewareParams = {
      action: string;
      [key: string]: unknown;
    };

    export type Middleware = (
      params: MiddlewareParams,
      next: (params: MiddlewareParams) => Promise<unknown>,
    ) => Promise<unknown>;
  }
}
