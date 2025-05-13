import React from 'react';

type Room = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  interactive: boolean;
  internet_search: boolean;
};

interface RoomListProps {
  rooms: Room[];
  currentRoom: Room | null;
  setCurrentRoom: (room: Room) => void;
  fetchMessages: (roomId: string) => void;
  createNewRoom: () => void;
}

const RoomList: React.FC<RoomListProps> = ({ rooms, currentRoom, setCurrentRoom, fetchMessages, createNewRoom }) => (
  <div className="w-64 flex-shrink-0">
    <button
      onClick={createNewRoom}
      className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 mb-4"
    >
      新しいチャット
    </button>
    <div className="space-y-2">
      {rooms.map((room) => (
        <button
          key={room.id}
          onClick={() => {
            setCurrentRoom(room);
            fetchMessages(room.id);
          }}
          className={`w-full text-left px-4 py-2 rounded-lg ${
            currentRoom?.id === room.id
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
              : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          {room.title}
        </button>
      ))}
    </div>
  </div>
);

export default RoomList; 