import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import type { PortalDefinition, SovereignEventPayload } from "../types";

type PortalGridProps = {
  portals: PortalDefinition[];
  onPortalClick: (
    portal: PortalDefinition,
    payload: SovereignEventPayload
  ) => void | Promise<void>;
};

const PORTAL_THEMES: Record<string, { token: string; glow: string }> = {
  "portal-cosmic-hub": {
    token: "Crystal crossing",
    glow:
      "bg-[radial-gradient(circle_at_top,rgba(83,183,176,0.22),transparent_56%)]"
  },
  "portal-governance-citadel": {
    token: "Flame crossing",
    glow:
      "bg-[radial-gradient(circle_at_top,rgba(140,88,112,0.22),transparent_56%)]"
  },
  "portal-architect-forge": {
    token: "Forge crossing",
    glow:
      "bg-[radial-gradient(circle_at_top,rgba(214,179,95,0.22),transparent_56%)]"
  }
};

export function PortalGrid({ portals, onPortalClick }: PortalGridProps) {
  return (
    <div className="grid gap-4">
      {portals.map((portal) => {
        const theme = PORTAL_THEMES[portal.id] ?? {
          token: "Portal crossing",
          glow:
            "bg-[radial-gradient(circle_at_top,rgba(214,179,95,0.18),transparent_56%)]"
        };

        return (
          <article
            key={portal.id}
            className="prism-liana-panel relative overflow-hidden px-6 py-8"
          >
            <div className={`pointer-events-none absolute inset-0 ${theme.glow}`} />
            <div className="relative grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-start">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-sovereign-gold">
                  {theme.token}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.24em] text-[rgba(245,245,245,0.5)]">
                  {portal.destinationRealm}
                </p>
              </div>
              <div>
                <h3 className="font-display text-3xl text-radiant-white">{portal.label}</h3>
                <p className="mt-3 max-w-2xl text-base leading-8 text-[rgba(245,245,245,0.7)]">
                  {portal.description}
                </p>
              </div>
              <Button
                size="lg"
                variant="prismOutline"
                className="rounded-full px-6 text-[0.8rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold"
                onClick={() =>
                  onPortalClick(portal, {
                    eventType: "portal_exit",
                    portalId: portal.id,
                    metadata: {
                      destinationRealm: portal.destinationRealm,
                    },
                  })
                }
              >
                Cross Portal
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
