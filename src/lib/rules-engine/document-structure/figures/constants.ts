export const FIGURE_CAPTION_REGEX =
  /^\s*(Рисунок|Изображение)\s+(\d+(?:\.\d+)?)\s*[—–-]\s*(.+?)\s*$/iu;
export const FIGURE_REFERENCE_REGEX =
  /(рис(?:унок|унке|унка|унку|унком|унки)?|рис\.|изображени(?:е|я|ю|ем|и)?)\s*(\d+(?:\.\d+)?)/giu;
export const PERIOD_AT_END_REGEX = /\.\s*$/u;
