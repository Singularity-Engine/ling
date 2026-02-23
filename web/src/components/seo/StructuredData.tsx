import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";

/**
 * Outputs dynamic JSON-LD structured data for the Ling web app.
 * `name` and `description` are localized via i18next.
 */
export function StructuredData() {
  const { t } = useTranslation();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "Ling",
        alternateName: t("brand.nameDisplay"),
        url: "https://ling.sngxai.com",
        description: t("seo.homeDesc"),
        applicationCategory: "EntertainmentApplication",
        operatingSystem: "Web",
        inLanguage: ["en", "zh-CN", "ja", "ko", "es", "pt-BR", "de", "fr"],
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        image: "https://ling.sngxai.com/og-image.png",
        screenshot: "https://ling.sngxai.com/og-image.png",
        creator: { "@id": "#organization" },
      },
      {
        "@type": "Organization",
        "@id": "#organization",
        name: "Singularity Engine",
        url: "https://ling.sngxai.com",
        logo: "https://ling.sngxai.com/favicon.svg",
      },
    ],
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
}
