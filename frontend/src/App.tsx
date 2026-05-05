export default function App() {
  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden">
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 text-sm font-medium">Header</div>
      <div className="flex flex-1 min-h-0">
        <aside className="w-60 bg-white border-r border-gray-200">Left Panel</aside>
        <main className="flex-1 bg-gray-100 flex items-center justify-center text-sm text-gray-400">Preview</main>
      </div>
      <div className="h-48 bg-white border-t border-gray-200 flex items-center justify-center text-sm text-gray-400">Timeline</div>
    </div>
  );
}
