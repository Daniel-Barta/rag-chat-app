import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatMessage, Source } from '../../models/chat.model';
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-message',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message.component.html',
  styleUrls: ['./message.component.scss'],
})
export class MessageComponent implements OnInit, OnChanges {
  @Input() message!: ChatMessage;
  @Output() showSources = new EventEmitter<Source[]>();

  renderedContent: SafeHtml = '';

  constructor(private sanitizer: DomSanitizer) {
    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  ngOnInit(): void {
    this.renderContent();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['message']) {
      this.renderContent();
    }
  }

  private async renderContent(): Promise<void> {
    if (this.message.role === 'assistant' && this.message.content) {
      const html = await marked(this.message.content);
      this.renderedContent = this.sanitizer.bypassSecurityTrustHtml(html);
    } else {
      this.renderedContent = '';
    }
  }

  onShowSources(): void {
    if (this.message.sources && this.message.sources.length > 0) {
      this.showSources.emit(this.message.sources);
    }
  }

  get isUser(): boolean {
    return this.message.role === 'user';
  }

  get hasSourcesRef(): boolean {
    return this.message.sources !== undefined && this.message.sources.length > 0;
  }

  formatTime(date: Date): string {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
