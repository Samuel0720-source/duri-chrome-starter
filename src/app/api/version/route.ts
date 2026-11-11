// Which commit is live. The live-flow check waits for this to match the pushed commit.
// Vercel sets VERCEL_GIT_COMMIT_SHA for Git deployments; it names a public commit, nothing secret.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
}
