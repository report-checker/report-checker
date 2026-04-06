import { overlayBox } from "../../overlays";
import type { OverlayBox, RuleResult, RuleStatus } from "../../types";
import { styleForHeading } from "../styles";
import type { FigureDetection } from "./types";
import {
  flattenReferenceMap,
  formatReferenceLabel,
  sortReferencesByDocumentOrder,
} from "./utils";

export function buildFigureReferencesRule(
  detection: FigureDetection,
): RuleResult {
  const numberedCaptions = detection.captions;
  const allReferences = sortReferencesByDocumentOrder(
    flattenReferenceMap(detection.referencesByNumber),
  );
  const nonAppendixReferences = allReferences.filter(
    (reference) => !reference.isAppendix,
  );
  const hasMainIllustrations = detection.mainIllustrations.length > 0;
  const hasAppendixIllustrations = detection.appendixIllustrations.length > 0;
  const appendixReferenceChildren = nonAppendixReferences.map(
    (reference, index) => {
      const status: RuleStatus = reference.aliasIssue ? "fail" : "pass";
      const message = reference.aliasIssue
        ? `Стр. ${reference.pageNumber}: ${reference.aliasIssue}`
        : `Стр. ${reference.pageNumber}: ссылка на рисунок найдена.`;
      return {
        id: `figure-appendix-reference-hit-${reference.pageNumber}-${index}`,
        title: formatReferenceLabel(reference),
        status,
        message,
        children: [],
        overlayBoxes: reference.pageBox
          ? [
              overlayBox(
                reference.pageNumber,
                reference.pageBox,
                reference.bounds,
                styleForHeading(status),
              ),
            ]
          : [],
        jumpPageNumbers: [reference.pageNumber],
        childrenCollapsedByDefault: false,
        countInSummary: false,
      };
    },
  );
  const hasValidAppendixFigureReferences = appendixReferenceChildren.some(
    (child) => child.status === "pass",
  );

  if (numberedCaptions.length === 0) {
    if (hasMainIllustrations) {
      const mainIllustrationChildren = detection.mainIllustrations.map(
        (illustration, index) => ({
          id: `figure-main-uncaptioned-${illustration.pageNumber}-${index}`,
          title: `Иллюстрация в основной части (стр. ${illustration.pageNumber})`,
          status: "fail" as RuleStatus,
          message:
            "Не найдена подпись рисунка формата «Рисунок N — ...» для данного графического объекта.",
          children: [],
          overlayBoxes: illustration.pageBox
            ? [
                overlayBox(
                  illustration.pageNumber,
                  illustration.pageBox,
                  illustration.bounds,
                  styleForHeading("fail"),
                ),
              ]
            : [],
          jumpPageNumbers: [illustration.pageNumber],
          childrenCollapsedByDefault: false,
          countInSummary: false,
        }),
      );

      const orphanReferenceChildren = nonAppendixReferences.map(
        (reference, index) => {
          const issue = reference.aliasIssue
            ? `${reference.aliasIssue} Подпись соответствующего рисунка не найдена.`
            : "Подпись соответствующего рисунка не найдена.";
          return {
            id: `figure-orphan-reference-${reference.pageNumber}-${index}`,
            title: `Ссылка: ${formatReferenceLabel(reference)}`,
            status: "fail" as RuleStatus,
            message: `Стр. ${reference.pageNumber}: ${issue}`,
            children: [],
            overlayBoxes: reference.pageBox
              ? [
                  overlayBox(
                    reference.pageNumber,
                    reference.pageBox,
                    reference.bounds,
                    styleForHeading("fail"),
                  ),
                ]
              : [],
            jumpPageNumbers: [reference.pageNumber],
            childrenCollapsedByDefault: false,
            countInSummary: false,
          };
        },
      );

      const children = [
        ...mainIllustrationChildren,
        ...orphanReferenceChildren,
      ];

      return {
        id: "figures-references",
        title: "Ссылки на рисунки в тексте",
        status: "fail",
        message:
          orphanReferenceChildren.length > 0
            ? "Обнаружены графические объекты и ссылки на рисунки, но подписи рисунков не найдены. Проверьте формат подписей."
            : "Обнаружены графические объекты в основной части, но подписи рисунков не найдены.",
        children,
        overlayBoxes: children.flatMap((child) => child.overlayBoxes),
        jumpPageNumbers: [
          ...new Set(children.flatMap((child) => child.jumpPageNumbers)),
        ],
        childrenCollapsedByDefault: false,
        countInSummary: true,
      };
    }

    if (hasAppendixIllustrations) {
      const appendixChildren = detection.appendixIllustrations.map(
        (illustration, index) => {
          const status: RuleStatus = hasValidAppendixFigureReferences
            ? "pass"
            : "fail";
          const illustrationOverlay = illustration.pageBox
            ? [
                overlayBox(
                  illustration.pageNumber,
                  illustration.pageBox,
                  illustration.bounds,
                  styleForHeading(status),
                ),
              ]
            : [];
          const message =
            appendixReferenceChildren.length === 0
              ? "До приложения в тексте не найдена ссылка на соответствующий рисунок."
              : hasValidAppendixFigureReferences
                ? "Иллюстрация в приложении подтверждена ссылкой на рисунок в тексте."
                : "Ссылки найдены, но оформлены не как «Рисунок» или «рис.».";

          return {
            id: `figure-appendix-reference-${status}-${illustration.pageNumber}-${index}`,
            title: `Иллюстрация в приложении (стр. ${illustration.pageNumber})`,
            status,
            message,
            children: appendixReferenceChildren,
            overlayBoxes: [
              ...illustrationOverlay,
              ...appendixReferenceChildren.flatMap((child) => child.overlayBoxes),
            ],
            jumpPageNumbers: [
              ...new Set([
                illustration.pageNumber,
                ...appendixReferenceChildren.flatMap(
                  (child) => child.jumpPageNumbers,
                ),
              ]),
            ],
            childrenCollapsedByDefault: false,
            countInSummary: false,
          };
        },
      );

      const failed = appendixChildren.filter((child) => child.status === "fail");
      return {
        id: "figures-references",
        title: "Ссылки на рисунки в тексте",
        status: failed.length === 0 ? "pass" : "fail",
        message:
          failed.length === 0
            ? "Иллюстрации в приложениях обнаружены; ссылки на рисунки в тексте найдены."
            : appendixReferenceChildren.length === 0
              ? "Обнаружены иллюстрации в приложениях, но ссылки на рисунки в тексте не найдены."
              : "Обнаружены ссылки, но они оформлены неверно: используйте «Рисунок» или «рис.».",
        children: appendixChildren,
        overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
        jumpPageNumbers: [
          ...new Set(appendixChildren.flatMap((child) => child.jumpPageNumbers)),
        ],
        childrenCollapsedByDefault: false,
        countInSummary: true,
      };
    }

    if (nonAppendixReferences.length > 0) {
      const orphanChildren = nonAppendixReferences.map((reference, index) => {
        const status: RuleStatus = "fail";
        const issue = reference.aliasIssue
          ? `${reference.aliasIssue} Подпись соответствующего рисунка не найдена.`
          : "Подпись соответствующего рисунка не найдена.";
        return {
          id: `figure-orphan-reference-${reference.pageNumber}-${index}`,
          title: `Ссылка: ${formatReferenceLabel(reference)}`,
          status,
          message: `Стр. ${reference.pageNumber}: ${issue}`,
          children: [],
          overlayBoxes: reference.pageBox
            ? [
                overlayBox(
                  reference.pageNumber,
                  reference.pageBox,
                  reference.bounds,
                  styleForHeading("fail"),
                ),
              ]
            : [],
          jumpPageNumbers: [reference.pageNumber],
          childrenCollapsedByDefault: false,
          countInSummary: false,
        };
      });

      return {
        id: "figures-references",
        title: "Ссылки на рисунки в тексте",
        status: "fail",
        message:
          "Обнаружены ссылки на рисунки, но подписи рисунков не найдены. Проверьте формат подписей.",
        children: orphanChildren,
        overlayBoxes: orphanChildren.flatMap((child) => child.overlayBoxes),
        jumpPageNumbers: [
          ...new Set(orphanChildren.flatMap((child) => child.jumpPageNumbers)),
        ],
        childrenCollapsedByDefault: false,
        countInSummary: true,
      };
    }

    return {
      id: "figures-references",
      title: "Ссылки на рисунки в тексте",
      status: "pass",
      message: "Иллюстрации не обнаружены.",
      children: [],
      overlayBoxes: [],
      jumpPageNumbers: [],
      childrenCollapsedByDefault: false,
      countInSummary: true,
    };
  }

  const children = numberedCaptions.map((caption, index) => {
    const references = sortReferencesByDocumentOrder(
      detection.referencesByNumber.get(caption.numberRaw) ?? [],
    );
    const aliasReferences = references.filter(
      (reference) => reference.aliasIssue !== null,
    );
    const issues: string[] = [];
    if (references.length === 0) {
      issues.push("В тексте отсутствует ссылка на этот рисунок.");
    }
    if (aliasReferences.length > 0) {
      issues.push(
        "Ссылка найдена через «Изображение»; используйте «Рисунок» или «рис.».",
      );
    }
    const status: RuleStatus = issues.length === 0 ? "pass" : "fail";

    const referenceChildren =
      references.length > 0
        ? references.map((reference, referenceIndex) => {
            const referenceStatus: RuleStatus = reference.aliasIssue
              ? "fail"
              : "pass";
            const referenceMessage = reference.aliasIssue
              ? `Стр. ${reference.pageNumber}: ${reference.aliasIssue}`
              : `Стр. ${reference.pageNumber}: ссылка найдена.`;
            return {
              id: `figure-reference-hit-${caption.pageNumber}-${index}-${referenceIndex}`,
              title: formatReferenceLabel(reference),
              status: referenceStatus,
              message: referenceMessage,
              children: [],
              overlayBoxes: reference.pageBox
                ? [
                    overlayBox(
                      reference.pageNumber,
                      reference.pageBox,
                      reference.bounds,
                      styleForHeading(referenceStatus),
                    ),
                  ]
                : [],
              jumpPageNumbers: [reference.pageNumber],
              childrenCollapsedByDefault: false,
              countInSummary: false,
            };
          })
        : [
            {
              id: `figure-reference-missing-${caption.pageNumber}-${index}`,
              title: `Рисунок ${caption.numberRaw}`,
              status: "fail" as RuleStatus,
              message: "Ссылка в тексте не найдена.",
              children: [],
              overlayBoxes: [],
              jumpPageNumbers: [],
              childrenCollapsedByDefault: false,
              countInSummary: false,
            },
          ];

    const overlayBoxes: OverlayBox[] = [];
    if (caption.pageBox) {
      overlayBoxes.push(
        overlayBox(
          caption.pageNumber,
          caption.pageBox,
          caption.bounds,
          styleForHeading(status),
        ),
      );
    }
    overlayBoxes.push(
      ...referenceChildren.flatMap((child) => child.overlayBoxes),
    );

    return {
      id: `figure-reference-${caption.pageNumber}-${index}`,
      title: `Рисунок ${caption.numberRaw}`,
      status,
      message:
        issues.length === 0
          ? `Найдена ссылка(и) в тексте: ${references.length}.`
          : issues.join(" "),
      children: referenceChildren,
      overlayBoxes,
      jumpPageNumbers: [
        ...new Set([
          caption.pageNumber,
          ...referenceChildren.flatMap((child) => child.jumpPageNumbers),
        ]),
      ],
      childrenCollapsedByDefault: false,
      countInSummary: false,
    };
  });

  const failed = children.filter((child) => child.status === "fail");
  return {
    id: "figures-references",
    title: "Ссылки на рисунки в тексте",
    status: failed.length === 0 ? "pass" : "fail",
    message:
      failed.length === 0
        ? "На все рисунки есть ссылки в тексте."
        : `Для ${failed.length} рисунков отсутствуют ссылки в тексте.`,
    children,
    overlayBoxes: failed.flatMap((child) => child.overlayBoxes),
    jumpPageNumbers: [
      ...new Set(failed.flatMap((child) => child.jumpPageNumbers)),
    ],
    childrenCollapsedByDefault: false,
    countInSummary: true,
  };
}
