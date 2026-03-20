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
    <div className="editorial-rule border-y">
      {portals.map((portal) => (
        <article
          key={portal.id}
          className="editorial-rule grid gap-5 border-t py-7 first:border-t-0 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-start"
        >
          <p className="editorial-label">
            {portal.destinationRealm}
          </p>
          <div>
            <h3 className="font-display text-3xl text-black">{portal.label}</h3>
            <p className="editorial-copy mt-3 max-w-2xl text-base leading-8">
              {portal.description}
            </p>
          </div>
          <Button
            size="lg"
            variant="outline"
            className="rounded-full border-black/12 bg-white px-6 text-[0.74rem] uppercase tracking-[0.24em] text-black hover:bg-black/[0.03]"
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
