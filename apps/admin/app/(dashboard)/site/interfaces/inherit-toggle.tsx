'use client';

import { GitBranch, Library } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function InheritToggle({
  own,
  onCreateOwn,
  onRevert,
  inheritTitle,
  inheritHelp,
  createLabel,
}: {
  own: boolean;
  onCreateOwn: () => void;
  onRevert: () => void;
  inheritTitle?: string;
  inheritHelp?: string;
  createLabel?: string;
}) {
  if (!own) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex gap-2">
            <Library className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <div className="text-sm font-medium">
                {inheritTitle ?? 'Moștenește catalogul de la Catalog muzical'}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                {inheritHelp ??
                  'Stiluri, ocazii și voci sunt cele de pe site. Prompturile de aici nu există — se folosesc cele globale.'}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onCreateOwn}>
            {createLabel ?? 'Creează catalog propriu'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex gap-2">
          <GitBranch className="h-4 w-4 mt-0.5 text-primary shrink-0" />
          <div>
            <div className="text-sm font-medium">Catalog propriu</div>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
              Modificările de aici nu schimbă catalogul site-ului. Writer, demo-uri și reacții rămân la revenire.
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onRevert}>
          Revino la moștenire
        </Button>
      </CardContent>
    </Card>
  );
}
