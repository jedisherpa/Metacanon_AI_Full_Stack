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

export function PortalGrid({ portals, onPortalClick }: PortalGridProps) {
  return (
    <div className="border-y border-white/10">
      {portals.map((portal) => (
        <article
          key={portal.id}
          className="grid gap-5 border-t border-white/10 py-8 first:border-t-0 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-start"
        >
          <p className="text-xs uppercase tracking-[0.24em] text-[rgba(255,250,205,0.58)]">
            {portal.destinationRealm}
          </p>
          <div>
            <h3 className="font-display text-3xl text-radiant-white">{portal.label}</h3>
            <p className="mt-3 max-w-2xl text-base leading-8 text-[rgba(255,250,205,0.7)]">
              {portal.description}
            </p>
          </div>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full border-sovereign-gold/35 bg-transparent px-6 text-[0.8rem] font-semibold uppercase tracking-[0.2em] text-sovereign-gold"
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
            Cross portal
            <ArrowUpRight className="size-4" />
          </Button>
        </article>
      ))}
    </div>
  );
}
