'use client';

import { AlertTriangle, Database, Eye, EyeOff, ExternalLink, FileLock2, RotateCcw, Server, Trash2 } from 'lucide-react';
import type { SettingView } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';

export type DraftEntry = { value: string; clear?: boolean };

function optionLabel(setting: SettingView, raw: string): string {
  return setting.optionLabels?.[raw] ?? raw;
}

export function SettingRow({
  setting,
  draftEntry,
  showSecret,
  highlighted,
  onToggleSecret,
  onChange,
  onDiscard,
  onClear,
}: {
  setting: SettingView;
  draftEntry: DraftEntry | undefined;
  showSecret: boolean;
  highlighted?: boolean;
  onToggleSecret: () => void;
  onChange: (v: string) => void;
  onDiscard: () => void;
  onClear: () => void;
}) {
  const isDirty = !!draftEntry;
  const currentValue = draftEntry ? draftEntry.value : setting.value;
  const isSecret = setting.kind === 'secret';
  // Secret: GET e mascat; inputul rămâne gol până scrii tu. Nu echo-uim valoarea.
  const renderValue = isDirty ? currentValue : isSecret ? '' : currentValue;
  const boolOn = (isDirty ? currentValue : setting.value).toString() === 'true';
  const secretPlaceholder =
    isSecret && setting.hasDbValue && !isDirty
      ? '••••••• (lasă gol = neschimbat)'
      : setting.placeholder;

  return (
    <div
      data-field={setting.key}
      className={cn(
        'space-y-1.5 pb-4 border-b border-border last:border-b-0 last:pb-0 rounded-md transition-shadow',
        highlighted && 'ring-1 ring-primary/50 bg-primary/5 px-2 py-2',
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-sm font-medium">{setting.label}</Label>
        <code className="text-[10px] text-muted-foreground/70 font-mono">{setting.key}</code>
        <SourceBadge source={setting.source} hasDbValue={setting.hasDbValue} />
        {setting.encrypted && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <FileLock2 className="h-3 w-3" /> criptat
          </Badge>
        )}
        {setting.hotReload && !setting.requiresRestart && (
          <Badge variant="outline" className="gap-1 text-[10px] text-emerald-400 border-emerald-500/40">
            fără restart
          </Badge>
        )}
        {setting.requiresRestart && (
          <Badge variant="outline" className="gap-1 text-[10px] text-amber-500 border-amber-500/40">
            <AlertTriangle className="h-3 w-3" /> necesită restart
          </Badge>
        )}
        {isDirty && (
          <Badge variant="secondary" className="text-[10px] text-amber-500">
            {draftEntry?.clear ? 'se șterge' : 'modificat'}
          </Badge>
        )}
      </div>

      {setting.helpWhat ? (
        <p className="text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">Ce face. </span>
          {setting.helpWhat}
        </p>
      ) : setting.description ? (
        <p className="text-xs text-muted-foreground">{setting.description}</p>
      ) : null}
      {setting.helpWhere && (
        <p className="text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">De unde. </span>
          {setting.helpUrl ? (
            <a
              href={setting.helpUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              {setting.helpWhere}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-mono text-[11px]">{setting.helpWhere}</span>
          )}
        </p>
      )}
      {setting.helpWhat && setting.description && setting.description !== setting.helpWhat && (
        <p className="text-[11px] text-muted-foreground/80">{setting.description}</p>
      )}

      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0">
          {setting.kind === 'bool' ? (
            <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-background/40">
              <Switch checked={boolOn} onCheckedChange={(v) => onChange(v ? 'true' : 'false')} />
              <span className="text-sm text-muted-foreground">{boolOn ? 'Activat' : 'Dezactivat'}</span>
            </div>
          ) : setting.kind === 'select' ? (
            <Select value={isDirty ? currentValue : setting.value} onValueChange={onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selectează…" />
              </SelectTrigger>
              <SelectContent>
                {(setting.options ?? []).map((o) => (
                  <SelectItem key={o} value={o}>
                    {optionLabel(setting, o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : setting.kind === 'longtext' ? (
            <Textarea
              value={renderValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={secretPlaceholder}
              className="min-h-[80px] font-mono text-xs"
              autoComplete="off"
            />
          ) : (
            <Input
              type={setting.kind === 'number' ? 'number' : isSecret && !showSecret ? 'password' : 'text'}
              value={renderValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={secretPlaceholder}
              className={isSecret ? 'font-mono' : ''}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </div>

        {isSecret && (
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onToggleSecret}
            title={showSecret ? 'Ascunde' : 'Arată'}
            disabled={!isDirty && !renderValue}
          >
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        )}

        {isDirty ? (
          <Button variant="ghost" size="icon" type="button" onClick={onDiscard} title="Renunță la modificare">
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : (
          setting.hasDbValue && (
            <Button variant="ghost" size="icon" type="button" onClick={onClear} title="Șterge override-ul DB (revino la .env)">
              <Trash2 className="h-4 w-4" />
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source, hasDbValue }: { source: 'db' | 'env' | 'unset'; hasDbValue: boolean }) {
  if (hasDbValue || source === 'db') {
    return (
      <Badge variant="secondary" className="gap-1 text-[10px] text-primary">
        <Database className="h-3 w-3" /> DB
      </Badge>
    );
  }
  if (source === 'env') {
    return (
      <Badge variant="outline" className="gap-1 text-[10px]">
        <Server className="h-3 w-3" /> .env
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      nesetat
    </Badge>
  );
}
