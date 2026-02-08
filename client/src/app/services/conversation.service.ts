import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ChatMessage, Conversation } from '../models/chat.model';

@Injectable({
  providedIn: 'root'
})
export class ConversationService {
  private readonly STORAGE_KEY = 'rag-chat-conversations';
  
  private conversations$ = new BehaviorSubject<Conversation[]>([]);
  private activeConversation$ = new BehaviorSubject<Conversation | null>(null);

  constructor() {
    this.loadConversations();
  }

  /**
   * Get all conversations
   */
  getConversations(): Observable<Conversation[]> {
    return this.conversations$.asObservable();
  }

  /**
   * Get active conversation
   */
  getActiveConversation(): Observable<Conversation | null> {
    return this.activeConversation$.asObservable();
  }

  /**
   * Create a new conversation
   */
  createConversation(): Conversation {
    const conversation: Conversation = {
      id: this.generateId(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const conversations = [conversation, ...this.conversations$.value];
    this.conversations$.next(conversations);
    this.activeConversation$.next(conversation);
    this.saveConversations();

    return conversation;
  }

  /**
   * Set active conversation
   */
  setActiveConversation(id: string): void {
    const conversation = this.conversations$.value.find(c => c.id === id);
    if (conversation) {
      this.activeConversation$.next(conversation);
    }
  }

  /**
   * Add message to active conversation
   */
  addMessage(message: ChatMessage): void {
    const active = this.activeConversation$.value;
    if (!active) return;

    active.messages.push(message);
    active.updatedAt = new Date();

    // Update title from first user message
    if (active.title === 'New Chat' && message.role === 'user') {
      active.title = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
    }

    this.updateConversation(active);
  }

  /**
   * Update the last message (useful for streaming or loading states)
   */
  updateLastMessage(updates: Partial<ChatMessage>): void {
    const active = this.activeConversation$.value;
    if (!active || active.messages.length === 0) return;

    // Create new message object for change detection
    const lastIndex = active.messages.length - 1;
    const updatedMessage = { ...active.messages[lastIndex], ...updates };
    
    // Create new messages array with the updated message
    const newMessages = [...active.messages];
    newMessages[lastIndex] = updatedMessage;
    
    // Create new conversation object with new messages array
    const updatedConversation: Conversation = {
      ...active,
      messages: newMessages,
      updatedAt: new Date()
    };
    
    this.updateConversation(updatedConversation);
  }

  /**
   * Delete a conversation
   */
  deleteConversation(id: string): void {
    const conversations = this.conversations$.value.filter(c => c.id !== id);
    this.conversations$.next(conversations);

    if (this.activeConversation$.value?.id === id) {
      this.activeConversation$.next(conversations[0] || null);
    }

    this.saveConversations();
  }

  /**
   * Clear all conversations
   */
  clearAll(): void {
    this.conversations$.next([]);
    this.activeConversation$.next(null);
    this.saveConversations();
  }

  private updateConversation(conversation: Conversation): void {
    const conversations = this.conversations$.value.map(c => 
      c.id === conversation.id ? conversation : c
    );
    this.conversations$.next(conversations);
    this.activeConversation$.next(conversation);
    this.saveConversations();
  }

  private loadConversations(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const conversations: Conversation[] = JSON.parse(stored);
        // Convert date strings back to Date objects
        conversations.forEach(c => {
          c.createdAt = new Date(c.createdAt);
          c.updatedAt = new Date(c.updatedAt);
          c.messages.forEach(m => {
            m.timestamp = new Date(m.timestamp);
          });
        });
        this.conversations$.next(conversations);
        if (conversations.length > 0) {
          this.activeConversation$.next(conversations[0]);
        }
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  }

  private saveConversations(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.conversations$.value));
    } catch (error) {
      console.error('Error saving conversations:', error);
    }
  }

  private generateId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
