import React from 'react';
import { Message, useStore } from '../../stores/useStore';
import { MessageItem } from './MessageItem';
import './MessageList.css';

interface MessageListProps {
  messages: Message[];
}

export const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const { streamingMessage } = useStore();
  const allMessages = streamingMessage 
    ? [...messages, streamingMessage]
    : messages;

  return (
    <div className="message-list">
      {allMessages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
    </div>
  );
};