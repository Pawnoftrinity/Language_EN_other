import { createFileRoute } from "@tanstack/react-router";
import I18nFiller from "@/components/I18nFiller";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BMET SEEKER — i18n Gap Filler" },
      { name: "description", content: "Translate and download locale JSON files for 40+ languages." },
    ],
  }),
  component: I18nFiller,
});
