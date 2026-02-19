// src/components/chat/HistoryDropdown.tsx
import { Fragment } from "react";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from "@headlessui/react";
import { ClockIcon, TrashIcon } from "@heroicons/react/24/outline";
import { ChatSession } from "@/types/ai/deepseek";

interface Props {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewChat: () => void;
}

export function HistoryDropdown({
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewChat,
}: Props) {
  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton className="cursor-pointer p-2 rounded-full hover:text-[#BA34B7] transition-colors text-gray-400 hover:bg-pink-50">
        <ClockIcon className="size-5" />
      </MenuButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <MenuItems className="absolute top-10 right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg outline-1 outline-black/5 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in">
          <div className="py-2">
            <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800">
              Istorija konverzacija
            </div>

            <div className="max-h-96 overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  Nema sačuvanih konverzacija
                </div>
              ) : (
                sessions.map((session, i) => (
                  <MenuItem key={session.id}>
                    <div
                      className={`flex items-center justify-between px-4 py-2 text-sm ${
                        i ? "bg-gray-100 dark:bg-gray-800" : ""
                      } ${currentSessionId === session.id ? "bg-pink-50 dark:bg-pink-900/20" : ""}`}
                    >
                      <button
                        onClick={() => onSelectSession(session.id)}
                        className="cursor-pointer flex-1 text-left truncate"
                        title={session.title}
                      >
                        <span className="text-gray-900 text-xs dark:text-white">
                          {session.title}
                        </span>
                        <p className="text-[0.65rem] text-gray-500 dark:text-gray-400">
                          {session.messages.length} poruka •{" "}
                          {new Date(session.updatedAt).toLocaleDateString()}
                        </p>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(session.id);
                        }}
                        className="cursor-pointer pl-2 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  </MenuItem>
                ))
              )}
            </div>

            <div className="border-t border-gray-200 dark:border-gray-800 px-2 py-2">
              <button
                onClick={onNewChat}
                className="w-full px-3 py-2 text-xs font-medium text-[#BA34B7] hover:bg-pink-50 dark:hover:bg-pink-900/20 rounded-lg transition-colors"
              >
                + Nova konverzacija
              </button>
            </div>
          </div>
        </MenuItems>
      </Transition>
    </Menu>
  );
}
