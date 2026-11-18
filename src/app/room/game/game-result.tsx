"use client";
import { useT } from "../../../i18n/client";
export function GameResult({
  result,
  partnerName,
  myName,
  hand = false,
}: {
  result: "win" | "loss" | "tie" | "team";
  partnerName: string;
  myName?: string;
  hand?: boolean;
}) {
  const { t } = useT();
  return (
    <section className="game-result" data-result={result} role="status">
      <span aria-hidden="true">
        {result === "win"
          ? "🏆"
          : result === "loss"
            ? "💗"
            : result === "team"
              ? "🤝"
              : "✨"}
      </span>
      <div>
        <strong>{t(`result.${result}`)}</strong>
        <p>
          {hand
            ? t("result.hand")
            : result === "win"
              ? t("result.winner", { name: myName || t("common.me") })
              : result === "loss"
                ? t("result.winner", { name: partnerName })
                : t(result === "team" ? "result.teamNote" : "result.tieNote")}
        </p>
      </div>
    </section>
  );
}
