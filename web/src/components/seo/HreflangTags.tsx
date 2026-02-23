import { Helmet } from "react-helmet-async";
import { SUPPORTED_LANGUAGES, LOCALE_MAP } from "@/i18n";

interface HreflangTagsProps {
  canonicalUrl: string;
}

/**
 * Outputs <link rel="alternate" hreflang="..."> tags for all supported languages.
 * For SPA: supplements the static hreflang tags in index.html with dynamic Helmet injection.
 */
export function HreflangTags({ canonicalUrl }: HreflangTagsProps) {
  return (
    <Helmet>
      {SUPPORTED_LANGUAGES.map((lng) => {
        const hreflang = lng === "pt-BR" ? "pt-BR" : LOCALE_MAP[lng].split("_")[0];
        return (
          <link
            key={lng}
            rel="alternate"
            hreflang={hreflang}
            href={canonicalUrl}
          />
        );
      })}
      <link rel="alternate" hreflang="x-default" href={canonicalUrl} />
    </Helmet>
  );
}
