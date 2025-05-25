import React, { useState } from 'react';
import Controls from './components/Controls';
import LoadingSpinner from './components/LoadingSpinner';

function App() {
  // State to control the visibility of the loading spinner
  // We'll set this to true when calculations start, and false when they finish.
  // For now, let's set it to false so it's hidden by default.
  const [isLoading, setIsLoading] = useState<boolean>(false);
  return (
    <>
      {/* The canvas will be rendered here by your existing logic later */}
      {/* For now, this div acts as the container like in your original HTML */}
      <div id="canvas-container">
        {/* In a later phase, your Three.js or other canvas rendering logic will target this or a child element. */}
      </div>
      <Controls />
      <LoadingSpinner isVisible={isLoading} />
    </>
  );
}

export default App;