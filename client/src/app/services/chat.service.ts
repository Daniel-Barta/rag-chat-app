import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ChatResponse, HealthStatus, RagQueryResult } from '../models/chat.model';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly apiUrl = '/api';
  private sessionId = this.generateSessionId();
  
  private healthStatus$ = new BehaviorSubject<HealthStatus | null>(null);
  
  constructor(private http: HttpClient) {}

  /**
   * Get current health status as observable
   */
  getHealthStatus(): Observable<HealthStatus | null> {
    return this.healthStatus$.asObservable();
  }

  /**
   * Check server health and RAG status
   */
  checkHealth(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>(`${this.apiUrl}/health`).pipe(
      tap(status => this.healthStatus$.next(status)),
      catchError(this.handleError)
    );
  }

  /**
   * Initialize the chat model
   */
  initChatModel(): Observable<{ success: boolean; model: unknown }> {
    return this.http.post<{ success: boolean; model: unknown }>(`${this.apiUrl}/chat/init`, {}).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Send a chat message
   */
  sendMessage(message: string, topK: number = 5): Observable<ChatResponse> {
    return this.http.post<ChatResponse>(`${this.apiUrl}/chat`, {
      message,
      sessionId: this.sessionId,
      topK
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Direct RAG query
   */
  ragQuery(query: string, topK: number = 5): Observable<{ results: RagQueryResult[] }> {
    return this.http.post<{ results: RagQueryResult[] }>(`${this.apiUrl}/rag/query`, {
      query,
      topK
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Read a file from the repository
   */
  readFile(path: string, startLine?: number, endLine?: number): Observable<{ content: string; path: string }> {
    return this.http.post<{ content: string; path: string }>(`${this.apiUrl}/rag/read-file`, {
      path,
      startLine,
      endLine
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * List files in the repository
   */
  listFiles(dir?: string, recursive?: boolean, maxDepth?: number): Observable<{ files: string[] }> {
    return this.http.post<{ files: string[] }>(`${this.apiUrl}/rag/list-files`, {
      dir,
      recursive,
      maxDepth
    }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Clear conversation history
   */
  clearHistory(): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.apiUrl}/chat/history/${this.sessionId}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Start a new conversation with a new session
   */
  newConversation(): void {
    this.sessionId = this.generateSessionId();
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else {
      // Server-side error
      errorMessage = error.error?.error || error.message || `Error Code: ${error.status}`;
    }
    
    console.error('API Error:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
