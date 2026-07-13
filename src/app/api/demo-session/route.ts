import { NextResponse, type NextRequest } from "next/server";
import {
  demoSessionSchema,
  findDemoUser,
  listDemoUsers,
} from "@/server/identity/demo-session";
import { DEMO_USER_COOKIE } from "@/server/identity/current-user";
import {
  errorResponse,
  internalErrorResponse,
} from "@/server/http/responses";
import { readMutationRequest } from "@/server/http/mutation-request";

export async function GET() {
  try {
    const users = await listDemoUsers();
    return NextResponse.json({ users });
  } catch {
    return internalErrorResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const mutationRequest = await readMutationRequest(request);

    if (!mutationRequest.ok) {
      return mutationRequest.response;
    }

    const parsed = demoSessionSchema.safeParse(mutationRequest.payload);

    if (!parsed.success) {
      return errorResponse(
        400,
        "DEMO_IDENTITY_INVALID",
        "Select a valid demo identity.",
      );
    }

    const user = await findDemoUser(parsed.data.userId);

    if (!user) {
      return errorResponse(
        400,
        "DEMO_IDENTITY_INVALID",
        "Select a valid demo identity.",
      );
    }

    const response = NextResponse.json({ user });
    response.cookies.set(DEMO_USER_COOKIE, user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });

    return response;
  } catch {
    return errorResponse(
      400,
      "DEMO_IDENTITY_INVALID",
      "Select a valid demo identity.",
    );
  }
}
