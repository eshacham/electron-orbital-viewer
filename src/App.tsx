import React, { useState } from 'react';
import Controls from './components/Controls';
import LoadingSpinner from './components/LoadingSpinner';
import OrbitalViewer from './components/OrbitalViewer';

function App() {
  // State to control the visibility of the loading spinner
  // We'll set this to true when calculations start, and false when they finish.
  // For now, let's set it to false so it's hidden by default.
  const [isLoading, setIsLoading] = useState<boolean>(false);
  return (
    <>      
      <div id="canvas-container">
        <OrbitalViewer />
      </div>
      <Controls />
      <LoadingSpinner isVisible={isLoading} />
    </>
  );
}

export default App;