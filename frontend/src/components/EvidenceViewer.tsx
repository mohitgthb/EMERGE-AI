import { useState } from 'react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';
import { Camera, Clock, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EvidenceItem } from '@/types';

interface EvidenceViewerProps {
  items: EvidenceItem[];
  className?: string;
}

export function EvidenceViewer({ items, className }: EvidenceViewerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const current = items[selectedIndex];

  if (!items.length) {
    return (
      <div className={cn('rounded-lg border bg-card p-6 flex flex-col items-center justify-center text-muted-foreground', className)}>
        <Camera className="w-10 h-10 mb-2 opacity-30" />
        <p className="text-sm">No evidence available</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Evidence Viewer</h3>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">{selectedIndex + 1} / {items.length}</span>
      </div>

      {/* Media display */}
      <div className="relative aspect-video bg-background">
        <img
          src={current.url}
          alt={current.description}
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
        />
        {/* Overlay badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          <StatusBadge variant={current.severity}>{current.severity}</StatusBadge>
          <span className="inline-flex items-center gap-1 rounded-full bg-background/80 backdrop-blur px-2.5 py-0.5 text-[11px] font-mono text-foreground">
            {current.confidence}% conf
          </span>
        </div>
        <div className="absolute bottom-3 left-3 right-3 bg-background/80 backdrop-blur rounded-md p-2">
          <p className="text-xs text-foreground">{current.description}</p>
          <p className="text-[10px] font-mono text-muted-foreground mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(current.timestamp).toLocaleString()}
          </p>
        </div>
        {/* Navigation arrows */}
        {items.length > 1 && (
          <>
            <Button
              size="icon" variant="ghost"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/50 backdrop-blur hover:bg-background/80 w-8 h-8"
              onClick={() => setSelectedIndex((i) => (i - 1 + items.length) % items.length)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="icon" variant="ghost"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/50 backdrop-blur hover:bg-background/80 w-8 h-8"
              onClick={() => setSelectedIndex((i) => (i + 1) % items.length)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {/* Timeline thumbnails */}
      {items.length > 1 && (
        <div className="p-3 flex gap-2 overflow-x-auto">
          {items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setSelectedIndex(i)}
              className={cn(
                'w-16 h-12 rounded border-2 overflow-hidden shrink-0 transition-all',
                i === selectedIndex ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
              )}
            >
              <img src={item.url} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
