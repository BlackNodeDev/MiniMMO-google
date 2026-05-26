/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeBackgroundProps {
  complexity?: 'low' | 'regular' | 'high';
  theme?: 'light' | 'dark' | 'sepia' | 'wabi-sabi';
}

// GLSL 3D Simplex Noise implementation translated to string
const noiseGLSL = `
// Description : Array and textureless GLSL 2D/3D/4D simplex 
//               noise functions.
//      Author : Ian McEwan, Ashima Arts.
//  Maintainer : stegu
//     Lastmod : 20110822 (ijm)
//     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
//               Distributed under the MIT License. See LICENSE file.
//               https://github.com/ashima/webgl-noise or https://github.com/stegu/webgl-noise

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) { 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

  // Permutations
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //   vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //   vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  //Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}
`;

export default function ThreeBackground({ complexity = 'regular', theme = 'light' }: ThreeBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    // 1. Setup Scene, Camera, Renderer
    const scene = new THREE.Scene();

    // Responsive field of view
    const fov = window.innerWidth < 768 ? 60 : 45;
    const camera = new THREE.PerspectiveCamera(fov, container.clientWidth / container.clientHeight, 0.1, 100);
    // Position orb standardly center-right on desktop, center-top/mid on mobile
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: complexity !== 'low',
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. Select Geometry density according to User settings & system complexity
    let segments = 64;
    if (complexity === 'low') segments = 24;
    if (complexity === 'high') segments = 120;

    const geometry = new THREE.SphereGeometry(1.5, segments, segments);

    // 3. Define adaptive colors based on selected Japanese UI Theme
    // We pass these colors dynamically for custom shader styling
    const themeColors = {
      light: {
        primary: new THREE.Color(0xd97706),   // Amber vermillion tint
        secondary: new THREE.Color(0xf59e0b), // Golden warm sun
        ambient: new THREE.Color(0xfbfbfb),   // Clean white glow
        accent: new THREE.Color(0xb45309),    // Earth cinnabar
      },
      dark: {
        primary: new THREE.Color(0xef4444),   // Crimson seal
        secondary: new THREE.Color(0xec4899), // Deep pink dawn
        ambient: new THREE.Color(0x0f172a),   // Slate black
        accent: new THREE.Color(0x6366f1),    // Indigo twilight
      },
      sepia: {
        primary: new THREE.Color(0x451a03),   // Charcoal sumi
        secondary: new THREE.Color(0x92400e), // Amber lacquer
        ambient: new THREE.Color(0xfef3c7),   // Japanese Rice Paper (washi)
        accent: new THREE.Color(0xd97706),    // Golden Ochre
      },
      'wabi-sabi': {
        primary: new THREE.Color(0x52525b),   // Stone moss gray
        secondary: new THREE.Color(0x71717a), // Zinc shale
        ambient: new THREE.Color(0xf4f4f5),   // Dynamic mist
        accent: new THREE.Color(0xb5a642),    // Lichen moss gold
      }
    };

    const currentColors = themeColors[theme] || themeColors.light;

    // 4. Custom ShaderMaterial implementation
    const uniforms = {
      uTime: { value: 0 },
      uNoiseStrength: { value: complexity === 'low' ? 0.08 : complexity === 'high' ? 0.22 : 0.15 },
      uNoiseSpeed: { value: complexity === 'low' ? 0.3 : complexity === 'high' ? 0.8 : 0.5 },
      uColor1: { value: currentColors.primary },
      uColor2: { value: currentColors.secondary },
      uColorAmbient: { value: currentColors.ambient },
      uMouseX: { value: 0 },
      uMouseY: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: `
        uniform float uTime;
        uniform float uNoiseStrength;
        uniform float uNoiseSpeed;
        uniform float uMouseX;
        uniform float uMouseY;
        
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vNoise;
        varying vec3 vViewDir;

        ${noiseGLSL}

        void main() {
          vNormal = normalize(normalMatrix * normal);
          
          // Apply mouse interaction vector to displace coordinates slightly
          vec3 noisePos = position + vec3(uMouseX * 0.4, uMouseY * 0.4, 0.0);
          
          // Sample multidimensional 3D simplex noise using position and current elapsed time
          float noise = snoise(vec3(noisePos * 1.5 + vec3(0.0, 0.0, uTime * uNoiseSpeed)));
          vNoise = noise;

          // Displace actual vertex coordinates along original sphere normals (procedural wave)
          float strength = uNoiseStrength + (abs(uMouseX) + abs(uMouseY)) * 0.1;
          vec3 displacedPosition = position + normal * (noise * strength);

          vPosition = displacedPosition;
          
          vec4 mvPosition = modelViewMatrix * vec4(displacedPosition, 1.0);
          vViewDir = normalize(-mvPosition.xyz);
          
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColorAmbient;
        
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying float vNoise;
        varying vec3 vViewDir;

        void main() {
          // Compute classic Fresnel (outline glowing boundary)
          vec3 normal = normalize(vNormal);
          float fresnel = pow(1.0 - max(dot(normal, vViewDir), 0.0), 3.0);
          
          // Linear blend between the primary creative colors using noise density
          float mixFactor = (vNoise + 1.0) * 0.5;
          vec3 gradientColor = mix(uColor1, uColor2, mixFactor);
          
          // Infuse subtle ambient outer glows
          vec3 finalColor = mix(gradientColor, uColorAmbient, fresnel * 0.4);
          
          // Organic translucent falloff towards the edges for minimalist integration
          float alpha = 0.5 + 0.5 * (1.0 - fresnel);
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      uniforms,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // 5. Ambient light for general dimension
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    // 6. Smooth Mouse Position tracking targets
    const mouse = { x: 0, y: 0, currentX: 0, currentY: 0 };

    const handleMouseMove = (event: MouseEvent) => {
      // Normalize to -1 -> +1 bounds
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove);

    // 7. Responsive handling via ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.fov = width < 768 ? 60 : 45;
        camera.updateProjectionMatrix();
      }
    });
    resizeObserver.observe(container);

    // 8. Animation Loop
    const clock = new THREE.Clock();
    let animationFrameId: number;

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      
      // Update uniform clock
      uniforms.uTime.value = elapsed;

      // Elastic interpolation for ultra-smooth fluid mouse displacement (damping)
      const lerpValue = 0.08;
      mouse.currentX += (mouse.x - mouse.currentX) * lerpValue;
      mouse.currentY += (mouse.y - mouse.currentY) * lerpValue;

      uniforms.uMouseX.value = mouse.currentX;
      uniforms.uMouseY.value = mouse.currentY;

      // Subtle atmospheric core rotation
      mesh.rotation.x = elapsed * 0.06;
      mesh.rotation.y = elapsed * 0.08 + mouse.currentX * 0.2;
      mesh.rotation.z = elapsed * 0.02 + mouse.currentY * 0.25;

      // Render the scene!
      renderer.render(scene, camera);

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup listeners and dispose buffers on component unmount
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleTouchMove);
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrameId);
      
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [complexity, theme]);

  return (
    <div
      ref={containerRef}
      id="three-orb-container"
      className="absolute inset-0 pointer-events-none z-0 overflow-hidden mix-blend-multiply dark:mix-blend-screen opacity-70 transition-opacity duration-1000"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
