import { notifyOrderWork } from "../marketplace/work-scheduler";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { isReviewDemo } from "../auth/review-demo-context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) { return error.code === "INTERNAL_SERVER_ERROR" ? { ...shape, message: "We could not complete this request. Please try again shortly.", data: { ...shape.data, stack: undefined } } : shape; },
});

export const router = t.router;
const baseProcedure = t.procedure.use(async ({ ctx, path, type, next }) => {
  if (isReviewDemo() && (!ctx.user || ctx.user.role !== "user" || ctx.user.loginMethod !== "review-demo" ||
      !(path === "auth.me" || path === "auth.logout" || /^(marketplace|account|customer|support)\./.test(path))))
    throw new TRPCError({ code: "FORBIDDEN", message: "This demo provides customer access only." });
  const result = await next();
  if (type === "mutation" && result.ok && !isReviewDemo()) notifyOrderWork();
  return result;
});
export const publicProcedure = baseProcedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = baseProcedure.use(requireUser);

export const adminProcedure = baseProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
