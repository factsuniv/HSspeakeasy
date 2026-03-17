
import React from 'react';
import { ChatMessage, Emotion } from '../types';

interface ChatBubbleProps {
  message: ChatMessage;
}

const UserIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-indigo-400">
    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
  </svg>
);

const BotIcon: React.FC = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-teal-400">
    <path d="M16.0032 9.00148C16.0032 10.106 15.1076 11.0015 14.0032 11.0015C12.9832 11.0015 12.1612 10.2033 12.0195 9.23106C11.4057 9.07449 11.0032 8.59149 11.0032 8.00148C11.0032 6.89691 11.8988 6.00148 13.0032 6.00148C13.5615 6.00148 14.0535 6.18378 14.4333 6.48677C15.3473 6.66699 16.0032 7.42841 16.0032 8.35148V9.00148Z" />
    <path fillRule="evenodd" d="M6.16003 3.01007C6.16003 2.65681 6.32637 2.32753 6.60263 2.10601C7.22822 1.60835 8.04018 1.34046 8.89205 1.18012C9.28821 1.09638 9.69532 1.03666 10.1091 1.00304C10.2151 0.994277 10.322 0.990066 10.4301 0.990066H13.5731C13.6811 0.990066 13.788 0.994277 13.8941 1.00304C14.3079 1.03666 14.715 1.09638 15.1111 1.18012C15.963 1.34046 16.775 1.60835 17.3995 2.10601C17.6758 2.32753 17.8421 2.65681 17.8421 3.01007V9.00148C17.8421 9.99848 17.1519 10.8256 16.1824 11.069L16.6698 12.0233C17.2007 13.0649 17.0268 14.3948 16.2423 15.348L15.4221 16.3291L15.7093 17.258C16.3853 19.444 14.7456 21.5643 12.4913 21.9329C12.3323 21.9596 12.1693 21.9731 12.0032 21.9731C11.8371 21.9731 11.6741 21.9596 11.5151 21.9329C9.26082 21.5643 7.62111 19.444 8.29712 17.258L8.58434 16.3291L7.76414 15.348C6.97966 14.3948 6.80572 13.0649 7.33663 12.0233L7.82404 11.069C6.85458 10.8256 6.16003 9.99848 6.16003 9.00148V3.01007ZM12.0032 13.0015C14.2123 13.0015 16.0032 14.7923 16.0032 17.0015C16.0032 17.5458 15.9009 18.0673 15.7171 18.5471C15.1028 20.211 13.6191 21.3731 11.7891 21.3481C11.8617 21.352 11.9327 21.3542 12.0032 21.3542C12.0736 21.3542 12.1446 21.352 12.2172 21.3481C14.0472 21.3731 15.5309 20.211 16.1452 18.5471C16.329 18.0673 16.4313 17.5458 16.4313 17.0015C16.4313 14.5714 14.4332 12.5733 12.0032 12.5733C9.57313 12.5733 7.57508 14.5714 7.57508 17.0015C7.57508 17.5458 7.67738 18.0673 7.86119 18.5471C8.47548 20.211 9.95922 21.3731 11.7891 21.3481C11.8617 21.352 11.9327 21.3542 12.0032 21.3542C12.0736 21.3542 12.1446 21.352 12.2172 21.3481C10.3872 21.3731 8.90352 20.211 8.28922 18.5471C8.10542 18.0673 8.00317 17.5458 8.00317 17.0015C8.00317 14.7923 9.79405 13.0015 12.0032 13.0015Z" clipRule="evenodd" />
  </svg>
);


const EmotionPill: React.FC<{ emotion: Emotion }> = ({ emotion }) => (
  <div
    className="px-2 py-0.5 text-xs rounded-full mr-1 mb-1"
    style={{ 
      backgroundColor: `rgba(110, 231, 183, ${Math.max(0.1, emotion.score * 0.5)})`, // teal-300 with opacity based on score
      borderColor: `rgba(45, 212, 191, ${Math.max(0.3, emotion.score * 0.8)})`, // teal-400
      borderWidth: '1px',
      color: emotion.score > 0.5 ? '#042f2e' : '#a3f7ff', // Darker text for higher scores for contrast
    }}
  >
    {emotion.name} ({emotion.score.toFixed(2)})
  </div>
);

const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.sender === 'user';
  const bubbleClasses = isUser
    ? 'bg-indigo-600 self-end rounded-tl-xl rounded-tr-xl rounded-bl-xl'
    : 'bg-gray-700 self-start rounded-tr-xl rounded-tl-xl rounded-br-xl';
  
  const topEmotions = message.emotions
    ?.sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-end max-w-lg md:max-w-xl ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        <div className={`p-1 ${isUser ? 'ml-2' : 'mr-2'}`}>
          {isUser ? <UserIcon /> : <BotIcon />}
        </div>
        <div className={`px-4 py-3 text-white shadow-md ${bubbleClasses}`}>
          <p className="whitespace-pre-wrap">{message.text}</p>
          {message.audioSrc && (
            <audio controls src={message.audioSrc} className="w-full mt-2 h-8" />
          )}
          {topEmotions && topEmotions.length > 0 && (
            <div className="mt-2 flex flex-wrap border-t border-gray-600 pt-2">
              {topEmotions.map(emotion => (
                <EmotionPill key={emotion.name} emotion={emotion} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatBubble;
