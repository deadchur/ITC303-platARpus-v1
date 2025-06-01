import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

// TODO: refactor to follow OO best practices
// ARScene.js:
// ModelLoader.js:
// AudioManager.js:
// AnimationAudioSubject.js:
// PlatARpus.js: 

// design pattern (observer)
class AudioAnimationSubject {
  constructor() {
    this.observers = [];
    this.currentTime = 0;
    this.isPlaying = false;
  }

  subscribe(observer) {
    this.observers.push(observer);
  }

  unsubscribe(observer) {
    this.observers = this.observers.filter(obs => obs !== observer);
  }

  notifyTimeUpdate(time) {
    this.currentTime = time;
    this.observers.forEach(observer => observer.onTimeUpdate(time));
  }

  notifyPlayStateChange(isPlaying) {
    this.isPlaying = isPlaying;
    this.observers.forEach(observer => observer.onPlayStateChange(isPlaying));
  }
}

const PlatARpus = () => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const mixerRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const modelRef = useRef(null);
  const audioRef = useRef(null);
  const subjectRef = useRef(new AudioAnimationSubject());
  
  const [arSupported, setArSupported] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // initialize scene
  useEffect(() => {

    if (typeof window == 'undefined') return;

    // WebXR compatibility check
    if ('xr' in navigator) {
      navigator.xr.isSessionSupported('immersive-ar')
        .then((supported) => {
          setArSupported(supported);
        })
        .catch(err => {
          setErrorMessage(`AR error: ${err.message}`);
        });
    } else {
      setErrorMessage('WebXR not supported in this browser');
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // renderer
    const renderer = new THREE.WebGLRenderer({ 
      alpha: true,
      antialias: true
    });

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 2;
    camera.matrixAutoUpdate = false;
    cameraRef.current = camera;
    
    // camera helper (used to confirm model loads)
    //*
    //
    // const helper = new THREE.CameraHelper(camera);
    // scene.add(helper);
    // renderer.autoClear = false;
    // renderer.setSize(window.innerWidth, window.innerHeight);
    // renderer.setPixelRatio(window.devicePixelRatio);
    // renderer.xr.enabled = true;
    // rendererRef.current = renderer;
    //  */


    const rectangleLight = new THREE.RectAreaLight(0xffffff, 1, 10, 10);
    rectangleLight.position.set(5, 5, 0);
    rectangleLight.lookAt(0, 0, 0);
    scene.add(rectangleLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 0);
    scene.add(directionalLight);

    const container = containerRef.current;
    if (container) {
      container.appendChild(renderer.domElement);
      
        const arButton = ARButton.createButton(renderer, {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: document.body }
        });
        container.appendChild(arButton);
    }

    // animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      if (mixerRef.current) {
        const delta = clockRef.current.getDelta();
        mixerRef.current.update(delta);
      }
      
      renderer.render(scene, camera);
    };
    animate();

    // resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // cleanup, cache clear?
    return () => {
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      //subjectRef.current.unsubscribe();
      scene.clear();
    };
  }, []);

  // load model
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const loader = new GLTFLoader();
    // replace file path if necessary (Azure Blob, GitHub)
    loader.load('/model/platarpus_test.glb',
      (gltf) => {
        const model = gltf.scene;
        //model.position.set(0, 0, 3);
        model.scale.set(0.03, 0.03, 0.03);
        scene.add(model);
        modelRef.current = model;

        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;

        // map animation names
        if (gltf.animations.length > 0) {
          const clip = gltf.animations[0];
          const action = mixer.clipAction(clip);
          action.play();
        }

        // Create an observer for the animation(s)
        const animationObserver = {
          onTimeUpdate(time) {
            // if we need to add more animations
          },
          onPlayStateChange(isPlaying) {
            // pause/resume animations based on audio play state
            mixer.timeScale = isPlaying ? 1 : 0;
          }
        };

        // subscribe to the subject
        subjectRef.current.subscribe(animationObserver);
        setModelLoaded(true);
      },
      // progress bar
      (xhr) => {
        console.log('Loading model:', (xhr.loaded / xhr.total) * 100, '%');
      },
      // error handling
      (error) => {
        setErrorMessage(`Error loading model: ${error.message}`);
        console.error('Error loading model:', error);
        // TODO: clear cache/exit
      }
    );

    // clean animations
    return () => {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
      }
    };
  }, []);

  useEffect(() => {
    const audio = new Audio('/audio/test_narration.mp3');
    // alternatives (Azure Blob, GitHub, etc)
    audio.preload = 'auto';
    audioRef.current = audio;

    // event listeners for the observer
    const notifyTimeUpdate = () => {
      subjectRef.current?.notifyTimeUpdate(audio.currentTime);
    }

    const notifyPlay = () => {
      subjectRef.current?.notifyPlayStateChange(true);
    }

    const notifyPause = () => {
      subjectRef.current?.notifyPlayStateChange(false);
    }

    const notifyEnded = () => {
      sceneRef.current?.notifyPlayStateChange(false);
    }

    audio.addEventListener('timeupdate', notifyTimeUpdate);    
    audio.addEventListener('play', notifyPlay);
    audio.addEventListener('pause', notifyPause);
    audio.addEventListener('ended', notifyEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', notifyTimeUpdate);
      audio.removeEventListener('play', notifyPlay);
      audio.removeEventListener('pause', notifyPause);
      audio.removeEventListener('ended', notifyEnded);
      audio.src = '';
    };
  }, []);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.xr.addEventListener('sessionstart', handleARSessionStart);
      return () => {
        rendererRef.current.xr.removeEventListener('sessionstart', handleARSessionStart);
      };
    }
  }, [modelLoaded]);

  const handleARSessionStart = () => {
    if (audioRef.current && modelRef.current) {
      // need to test
      audioRef.current.play().catch(error => {
        console.warn('Audio blocked or failed:', error)
      });
    }
  };

  return (
    <div className="ar-container">
      <div ref={containerRef} className="canvas-container" />
      {!arSupported && (
        <div className="ar-not-supported">
          <p>AR is not supported on this device or browser.</p>
          <p>Please use a WebXR-compatible browser on a supported device.</p>
        </div>
      )}
      {errorMessage && (
        <div className="error-message">
          <p>{errorMessage}</p>
        </div>
      )}
      {!modelLoaded && arSupported && (
        <div className="loading">
          <p>Loading 3D model...</p>
        </div>
      )}
      {/* purely for testing */}
      <div className="controls">
        <button onClick={() => audioRef.current?.play()} disabled={!modelLoaded}>
          Play Audio
        </button>
        <button onClick={() => audioRef.current?.pause()} disabled={!modelLoaded}>
          Pause Audio
        </button>
      </div>
      <div className='help-container'>
        <button onClick={() => setShowHelp(!showHelp)}>
          {showHelp ? 'Close help' : 'Help'}
        </button>
        {showHelp && (
          <div className='help-panel'>
          <h2>How to Use PlatARpus</h2>
          <ul>
            <li>Use an iphone with iOS x.x or Android x.x</li>
            <li>Tap on "Start AR" to begin</li>
            <li>Slowly look around to view the platypus</li>
          </ul>
        </div>
        )}
      </div>
    </div>
  );
};

export default PlatARpus;