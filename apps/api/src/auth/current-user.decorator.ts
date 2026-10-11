import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthUser } from "./jwt-auth.guard.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);