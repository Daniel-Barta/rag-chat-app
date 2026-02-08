import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Conversation } from '../../models/chat.model';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  @Input() conversations: Conversation[] = [];
  @Input() activeConversationId = '';
  @Input() isOpen = true;

  @Output() newChat = new EventEmitter<void>();
  @Output() selectConversation = new EventEmitter<string>();
  @Output() deleteConversation = new EventEmitter<string>();
  @Output() toggle = new EventEmitter<void>();

  onNewChat(): void {
    this.newChat.emit();
  }

  onSelectConversation(id: string): void {
    this.selectConversation.emit(id);
  }

  onDeleteConversation(event: Event, id: string): void {
    event.stopPropagation();
    if (confirm('Delete this conversation?')) {
      this.deleteConversation.emit(id);
    }
  }

  formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(date).toLocaleDateString();
  }
}
