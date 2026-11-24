import { getT } from "../i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="error-page">
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
      <div className="error-actions"><a className="button" href="/room">{t("error.home")}</a></div>
    </main>
  );
}
