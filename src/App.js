import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

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

  // initialize scene
  useEffect(() => {
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

    // camera helper
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    cameraRef.current = camera;

    const helper = new THREE.CameraHelper(camera);
    scene.add(helper);

    // renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    const width = 10;
    const height = 10;
    const intensity = 1;
    const rectangeLight = new THREE.RectAreaLight(0xfffff, intensity, width, height);
    rectangeLight.position.set(5, 5, 0);
    rectangeLight.lookAt(0, 0, 0);
    scene.add(rectangeLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 0);
    scene.add(directionalLight);

    if (containerRef.current) {
      containerRef.current.appendChild(renderer.domElement);
      
        const arButton = ARButton.createButton(renderer, {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: document.body }
        });
        containerRef.current.appendChild(arButton);
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
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      scene.clear();
    };
  }, [arSupported]);

  // load model
  useEffect(() => {
    if (!sceneRef.current) return;

    const loader = new GLTFLoader();
    // replace file path if necessary (Azure Blob, GitHub)
    loader.load(
      './model/platypus.glb',
      (gltf) => {
        const model = gltf.scene;
        model.position.set(0, 0, -3);
        model.scale.set(1, 1, 1);
        sceneRef.current.add(model);
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
        // clear cache/exit
      }
    );

    // clean animations
    return () => {
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
      }
    };
  }, [sceneRef.current]);

  useEffect(() => {
    const audio = new Audio();
    // alternatives (Azure Blob, GitHub, etc)
    audio.src = './audio/narration.mp3';
    audio.preload = 'auto';
    audioRef.current = audio;

    // event listeners for the observer
    audio.addEventListener('timeupdate', () => {
      subjectRef.current.notifyTimeUpdate(audio.currentTime);
    });

    audio.addEventListener('play', () => {
      subjectRef.current.notifyPlayStateChange(true);
    });

    audio.addEventListener('pause', () => {
      subjectRef.current.notifyPlayStateChange(false);
    });

    audio.addEventListener('ended', () => {
      subjectRef.current.notifyPlayStateChange(false);
    });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  const handleARSessionStart = () => {
    if (audioRef.current && modelRef.current) {
      // need to test
      audioRef.current.play();
    }
  };

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.xr.addEventListener('sessionstart', handleARSessionStart);
      return () => {
        rendererRef.current.xr.removeEventListener('sessionstart', handleARSessionStart);
      };
    }
  }, [modelLoaded]);

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
      <div className="controls">
        <button 
          onClick={() => audioRef.current?.play()} 
          disabled={!modelLoaded}
        >
          Play Audio
        </button>
        <button 
          onClick={() => audioRef.current?.pause()} 
          disabled={!modelLoaded}
        >
          Pause Audio
        </button>
      </div>
    </div>
  );
};

export default PlatARpus;