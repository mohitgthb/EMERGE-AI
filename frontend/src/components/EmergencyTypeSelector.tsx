import { useState } from 'react';
import type { SOSEmergencyType } from '@/types';

interface EmergencyTypeSelectorProps {
  onSelect: (type: SOSEmergencyType) => void;
  onCancel: () => void;
}

const EMERGENCY_TYPES: {
  type: SOSEmergencyType;
  label: string;
  icon: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  hoverBg: string;
}[] = [
  {
    type: 'ACCIDENT',
    label: 'Accident',
    icon: '🚑',
    description: 'Vehicle crash, road accident, or injury requiring medical aid',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    hoverBg: 'hover:bg-red-100',
  },
  {
    type: 'FIRE',
    label: 'Fire',
    icon: '🔥',
    description: 'Building fire, wildfire, gas leak, or hazardous situation',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
    hoverBg: 'hover:bg-orange-100',
  },
  {
    type: 'CRIME',
    label: 'Crime',
    icon: '🚨',
    description: 'Theft, assault, suspicious activity, or safety threat',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    hoverBg: 'hover:bg-blue-100',
  },
];

export function EmergencyTypeSelector({ onSelect, onCancel }: EmergencyTypeSelectorProps) {
  const [selected, setSelected] = useState<SOSEmergencyType | null>(null);

  const handleConfirm = () => {
    if (selected) onSelect(selected);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-4 max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Emergency Type</h2>
        <p className="text-gray-500 text-sm">Select the type of emergency you're reporting</p>
      </div>

      <div className="grid grid-cols-1 gap-3 w-full">
        {EMERGENCY_TYPES.map((et) => (
          <button
            key={et.type}
            onClick={() => setSelected(et.type)}
            className={`
              flex items-center gap-4 p-5 rounded-xl border-2 transition-all duration-200 text-left
              ${selected === et.type
                ? `${et.bgColor} ${et.borderColor} ring-2 ring-offset-1 ring-current shadow-md`
                : `bg-white border-gray-200 ${et.hoverBg} hover:border-gray-300`
              }
            `}
          >
            <span className="text-4xl flex-shrink-0">{et.icon}</span>
            <div className="flex-1 min-w-0">
              <span className={`text-lg font-semibold ${selected === et.type ? et.color : 'text-gray-900'}`}>
                {et.label}
              </span>
              <p className="text-sm text-gray-500 mt-0.5 leading-snug">{et.description}</p>
            </div>
            {selected === et.type && (
              <svg className={`w-6 h-6 ${et.color} flex-shrink-0`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-3 w-full">
        <button
          onClick={onCancel}
          className="flex-1 py-3 px-4 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!selected}
          className={`
            flex-1 py-3 px-4 rounded-lg font-semibold text-white transition-all
            ${selected
              ? 'bg-red-600 hover:bg-red-700 shadow-md'
              : 'bg-gray-300 cursor-not-allowed'
            }
          `}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

export default EmergencyTypeSelector;
