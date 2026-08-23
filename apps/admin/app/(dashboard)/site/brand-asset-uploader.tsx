'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { SitesApi, ALL_SITES } from '@/lib/api/sites.api';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type BrandAssetField = 'logoUrl' | 'ogImageUrl' | 'faviconUrl' | 'emailBannerUrl';

export function BrandAssetUploader({
  siteId,
  field,
  accept,
  value,
  onChange,
  placeholder,
}: {
  siteId: string;
  field: BrandAssetField;
  accept: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!siteId || siteId === ALL_SITES) return;
    setUploading(true);
    try {
      const res = await SitesApi.uploadBrandAsset(siteId, field, file);
      onChange(res.url);
      toast({ variant: 'success', title: 'Fișier încărcat', description: 'Link public generat și salvat.' });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Eroare upload', description: (err as Error).message });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const isImage = !!value && !value.toLowerCase().endsWith('.ico');

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'https://...'}
        />
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Se încarcă...' : 'Încarcă fișier'}
        </Button>
      </div>
      {value && (
        <div className="flex items-center gap-3 rounded border border-border bg-muted/30 p-2">
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={field}
              className="h-12 w-12 rounded border border-border object-contain bg-white"
            />
          )}
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="truncate text-xs text-muted-foreground hover:text-foreground underline"
          >
            {value}
          </a>
        </div>
      )}
    </div>
  );
}
