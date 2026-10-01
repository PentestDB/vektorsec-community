"use client";

import { Fragment } from "react";
import { parseRichText } from "@/utils/richText";

const TAGS = { code: "code", strong: "strong" };

/**
 * Render a translated string that carries light inline markup:
 *
 *   <RichText text={t("mythicSettings.guideStart")} />
 *
 * `backticks` become <code> and **double asterisks** become <strong> — see
 * utils/richText.js for the parser.
 */
export default function RichText({ text }) {
  return parseRichText(text).map((token, index) => {
    const Tag = TAGS[token.type];
    return Tag ? (
      <Tag key={index}>{token.value}</Tag>
    ) : (
      <Fragment key={index}>{token.value}</Fragment>
    );
  });
}
