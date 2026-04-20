interface Props {
  currentPage: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}

export default function Pagination({ currentPage, totalPages, onPrev, onNext }: Props) {
  return (
    <div className="flex justify-center items-center gap-6">
      <button
        onClick={onPrev}
        disabled={currentPage === 0}
        className="px-6 py-1 bg-gray-700 text-white font-semibold rounded-lg disabled:bg-gray-400"
      >
        ← Anterior
      </button>
      <span className="text-lg font-bold">
        Página {currentPage + 1} de {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={currentPage + 1 >= totalPages}
        className="px-6 py-1 bg-gray-700 text-white font-semibold rounded-lg disabled:bg-gray-400"
      >
        Siguiente →
      </button>
    </div>
  );
}
