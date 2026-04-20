import { Check, X } from 'lucide-react';

export default function OrderItem({
  trans,
  itemName,
  modifiers,
  onToggle,
  isHighlighted = false,
  expandedView = false
}) {
  const isCompleted = trans.Status === 'FINISHED';
  const isCanceled = trans.TransactionStatus === '2';

  return (
    <div className={`bg-white border-b transition-all ${isHighlighted ? 'ring-2 ring-inset ring-blue-500 bg-blue-50' : ''
      } ${isCanceled
        ? 'border-l-4 border-l-red-500 bg-red-50'
        : isCompleted
          ? 'border-l-4 border-l-green-500 bg-green-50'
          : 'border-l-4 border-l-transparent'
      } ${expandedView ? 'p-2 rounded-lg shadow-md mb-3' : ''}`}>
      <div className={`flex items-start justify-between gap-2 py-1 px-2`}>
        <div className="flex-1 min-w-0">
          <div className={`text-xl leading-tight font-bebas font-normal flex gap-2 ${isCanceled
            ? 'line-through text-red-600'
            : isCompleted
              ? 'line-through text-gray-500 gap-3'
              : 'gap-3 text-black'
            }`}>
            <span className={`shrink-0`}>
              {trans.Quantity}
            </span>
            <span className="wrap-break-words">{itemName}</span>
          </div>

          {modifiers && modifiers.length > 0 && (
            <div className={`ml-6 space-y-0 leading-none text-lg font-normal font-bebas ${isCanceled ? 'text-red-500' : 'text-gray-600'
              }`}>
              {modifiers.map((m, i) => (
                <div key={i} className="wrap-break-words">• {m}</div>
              ))}
            </div>
          )}

          {trans.ShortNote && (
            <div className={`ml-6 text-lg leading-tight font-normal font-bebas wrap-break-words text-blue-600`}>
              📝 NOTA: {trans.ShortNote}
            </div>
          )}

          {isCanceled && (
            <div className={`ml-6 text-base leading-tight font-bold text-red-700 wrap-break-words`}>
              ⚠️ ITEM CANCELADO
            </div>
          )}
        </div>

        {!isCanceled && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`flex items-center justify-center rounded-full transition-all shrink-0 
            ${expandedView ? 'w-7 h-7' : 'w-6 h-6'} 
            ${isCompleted
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-gray-300 hover:bg-gray-400'
              }`}
          >
            {isCompleted ? (
              <Check className="text-white w-3 h-3" />
            ) : (
              <X className="w-3 h-3 text-gray-600" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
