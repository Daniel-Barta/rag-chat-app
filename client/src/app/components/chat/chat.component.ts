import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { ChatService } from '../../services/chat.service';
import { ConversationService } from '../../services/conversation.service';
import { ChatMessage, Conversation, HealthStatus, Source } from '../../models/chat.model';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { MessageComponent } from '../message/message.component';
import { SourcesPanelComponent } from '../sources-panel/sources-panel.component';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, MessageComponent, SourcesPanelComponent],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;

  conversations: Conversation[] = [];
  activeConversation: Conversation | null = null;
  healthStatus: HealthStatus | null = null;

  userMessage = '';
  isLoading = false;
  isSidebarOpen = true;
  showSources = false;
  selectedSources: Source[] = [];

  private destroy$ = new Subject<void>();
  private shouldScrollToBottom = false;

  constructor(
    private chatService: ChatService,
    private conversationService: ConversationService,
  ) {}

  ngOnInit(): void {
    // Subscribe to conversations
    this.conversationService
      .getConversations()
      .pipe(takeUntil(this.destroy$))
      .subscribe((conversations) => {
        this.conversations = conversations;
      });

    // Subscribe to active conversation
    this.conversationService
      .getActiveConversation()
      .pipe(takeUntil(this.destroy$))
      .subscribe((conversation) => {
        this.activeConversation = conversation;
        this.shouldScrollToBottom = true;
      });

    // Check health on init
    this.checkHealth();

    // Create new conversation if none exists
    if (this.conversations.length === 0) {
      this.newChat();
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  checkHealth(): void {
    this.chatService.checkHealth().subscribe({
      next: (status) => {
        this.healthStatus = status;
      },
      error: (error) => {
        console.error('Health check failed:', error);
        this.healthStatus = {
          status: 'error',
          server: { port: 0, mcpServerUrl: '' },
          rag: { ready: false, error: error.message },
          chat: { name: 'unknown', ready: false },
        };
      },
    });
  }

  newChat(): void {
    this.conversationService.createConversation();
    this.chatService.newConversation();
    this.showSources = false;
    this.selectedSources = [];
  }

  selectConversation(id: string): void {
    this.conversationService.setActiveConversation(id);
    this.showSources = false;
    this.selectedSources = [];
  }

  deleteConversation(id: string): void {
    this.conversationService.deleteConversation(id);
  }

  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  sendMessage(): void {
    const message = this.userMessage.trim();
    if (!message || this.isLoading) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: this.generateId(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    this.conversationService.addMessage(userMsg);

    // Add loading assistant message
    const assistantMsg: ChatMessage = {
      id: this.generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };
    this.conversationService.addMessage(assistantMsg);

    this.userMessage = '';
    this.isLoading = true;
    this.shouldScrollToBottom = true;

    // Send to API
    this.chatService.sendMessage(message).subscribe({
      next: (response) => {
        this.conversationService.updateLastMessage({
          content: response.response,
          sources: response.sources,
          isLoading: false,
        });
        this.isLoading = false;
        this.shouldScrollToBottom = true;
      },
      error: (error) => {
        this.conversationService.updateLastMessage({
          content: `Error: ${error.message}. Please check that the RAG server is running and try again.`,
          isLoading: false,
        });
        this.isLoading = false;
      },
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  showMessageSources(sources: Source[]): void {
    this.selectedSources = sources;
    this.showSources = true;
  }

  closeSources(): void {
    this.showSources = false;
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        const element = this.messagesContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      }
    } catch {
      // scroll error ignored
    }
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  get isRagReady(): boolean {
    return this.healthStatus?.rag?.ready === true;
  }

  get statusMessage(): string {
    if (!this.healthStatus) return 'Checking connection...';
    if (this.healthStatus.status === 'error') return 'Server unavailable';
    if (!this.healthStatus.rag?.ready) return 'RAG server indexing...';
    return 'Ready';
  }
}
