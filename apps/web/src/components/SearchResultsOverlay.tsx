import { Avatar } from './Avatar';
import type { Message } from '@discord-clone/shared';

export interface SearchResultsOverlayProps {
  searchResults: Message[] | null;
  searchQuery: string;
  isSearching: boolean;
  onClose: () => void;
}

export function SearchResultsOverlay({
  searchResults,
  searchQuery,
  isSearching,
  onClose,
}: SearchResultsOverlayProps) {
  if (searchResults === null) return null;

  return (
    <div className="search-results" role="region" aria-label="Resultados da busca">
      <div className="search-results-header">
        <span>
          {isSearching
            ? 'Buscando...'
            : `${searchResults.length} resultado${searchResults.length !== 1 ? 's' : ''} para "${searchQuery}"`}
        </span>
        <button type="button" onClick={onClose} className="search-results-close">
          Fechar
        </button>
      </div>

      {!isSearching && searchResults.length === 0 && (
        <p className="search-results-empty">Nenhuma mensagem encontrada.</p>
      )}

      <ul className="search-results-list">
        {searchResults.map((msg) => (
          <li key={msg.id} className="search-result-item">
            <Avatar
              src={msg.author.avatarUrl}
              name={msg.author.displayName}
              size={36}
              className="avatar"
            />
            <div>
              <span className="author-name">{msg.author.displayName}</span>
              <span className="timestamp">{new Date(msg.createdAt).toLocaleString('pt-BR')}</span>
              <p className="text">{msg.content}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
