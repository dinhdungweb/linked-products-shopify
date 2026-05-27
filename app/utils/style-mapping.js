export const PRODUCT_PAGE_STYLE_IDS = [
  "image_swatch",
  "slide_swatch",
  "scroll_swatch",
  "polaroid_swatch",
  "color_swatch",
  "square_color_swatch",
  "pill_swatch",
  "button",
  "pill_button",
  "dropdown",
  "image_dropdown",
];

export const PRODUCT_CARD_STYLE_IDS = [
  "button_card",
  "color_swatch_card",
  "image_swatch_card",
  "dropdown_card",
];

export function productPageStyleToCardStyle(style) {
  if (style === "hidden") return "hidden";

  if (
    style === "color_swatch" ||
    style === "square_color_swatch" ||
    style === "pill_swatch" ||
    style === "color_swatch_on_card" ||
    style === "color_swatch_card"
  ) {
    return "color_swatch_card";
  }

  if (
    style === "button" ||
    style === "pill_button" ||
    style === "block" ||
    style === "pill" ||
    style === "button_on_card" ||
    style === "button_card"
  ) {
    return "button_card";
  }

  if (
    style === "dropdown" ||
    style === "image_dropdown" ||
    style === "dropdown_on_card" ||
    style === "dropdown_card"
  ) {
    return "dropdown_card";
  }

  return "image_swatch_card";
}

export function normalizeProductCardStyle(cardStyle, productPageStyle = "image_swatch") {
  if (cardStyle === "same") {
    return productPageStyleToCardStyle(productPageStyle);
  }

  if (cardStyle === "hidden") return "hidden";
  if (PRODUCT_CARD_STYLE_IDS.includes(cardStyle)) return cardStyle;

  return productPageStyleToCardStyle(cardStyle || productPageStyle);
}
