/**
 * Shared SEO helpers for PadiHub.
 * Every page imports pageSeo() to build its Helmet props.
 */

export const SITE = 'https://padihub.com';
export const SITE_NAME = 'PadiHub';
export const DEFAULT_OG_IMAGE = `${SITE}/og-image.png`;
export const DEFAULT_DESCRIPTION =
  'The trusted community savings platform. Save together, grow together and belong — with full transparency, governance and Trust Score™.';

export interface PageSeoProps {
  title: string;
  description?: string;
  path: string;
  ogImage?: string;
  /** Set true for authenticated-only pages that should not be indexed */
  noindex?: boolean;
  jsonLd?: object;
}

export function pageSeo({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  ogImage = DEFAULT_OG_IMAGE,
  noindex = false,
  jsonLd,
}: PageSeoProps) {
  const url = `${SITE}${path}`;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} — ${SITE_NAME}`;
  return { url, fullTitle, description, ogImage, noindex, jsonLd };
}
