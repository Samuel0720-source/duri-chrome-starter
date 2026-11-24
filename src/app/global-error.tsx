"use client";

// Last resort when the root layout itself fails: no app styles or translations are available here.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center", background: "#fbe5e9", color: "#3a2a33" }}>
        <h1>문제가 생겼어요 · Something went wrong</h1>
        <p>다시 시도해 주세요. · Please try again.</p>
        <button type="button" onClick={reset} style={{ padding: "10px 18px", borderRadius: 10 }}>다시 시도 · Try again</button>
      </body>
    </html>
  );
}
