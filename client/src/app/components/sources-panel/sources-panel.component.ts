import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Source } from '../../models/chat.model';

@Component({
  selector: 'app-sources-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sources-panel.component.html',
  styleUrls: ['./sources-panel.component.scss']
})
export class SourcesPanelComponent {
  @Input() sources: Source[] = [];
  @Output() close = new EventEmitter<void>();

  expandedIndex: number | null = null;

  onClose(): void {
    this.close.emit();
  }

  toggleExpand(index: number): void {
    this.expandedIndex = this.expandedIndex === index ? null : index;
  }

  getScorePercentage(score: number): string {
    return (score * 100).toFixed(1);
  }

  getScoreClass(score: number): string {
    if (score >= 0.8) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }

  getFileName(path: string): string {
    return path.split('/').pop() || path;
  }

  getDirectory(path: string): string {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '.';
  }

  copySnippet(snippet: string): void {
    navigator.clipboard.writeText(snippet).then(() => {
      // Could add a toast notification here
      console.log('Copied to clipboard');
    });
  }
}
