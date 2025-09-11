"use strict";

// Import only what you need, to help your bundler optimize final code size using tree shaking
// see https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking)

import {
  AmbientLight,
  BoxGeometry,
  Clock,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  WebGLRenderer
} from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js"; //} from "https://js13kgames.com/2025/webxr/three.module.js";

// TODO: FIXME: include proper link in final version
// Oh no!!! Emulators are KO in THREE.js 179 !
// OK in 178 and 180
// XR
//import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRButton } from './XRButton.js';


let camera, scene, renderer;
let controller;
const cubes = [];
const collidableMeshList = [];

// Palette
var COLORS = {
  RED: 0xc84231,
  GREEN: 0x7cbc70,
  BLUE: 0x1c9ec3,
  MAGENTA: 0xae4c9d,
  YELLOW: 0xfcc245
};

const clock = new Clock();

// Main loop
const gameLoop = () => {

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  animateCubes(delta);

  // can be used in shaders: uniforms.u_time.value = elapsed;


  renderer.render(scene, camera);
};



const CUBE_ANIMATION_SPEED = 25;
const animateCubes = (delta) => {
  cubes.forEach((c) => {
    if (c.userData.active) {
      c.position.z += CUBE_ANIMATION_SPEED * delta;

      if (c.position.z > 10) {
        resetCube(c);
      }
    }
  })
}

const init = () => {
  scene = new Scene();

  scene.fog = new Fog(0xffffff, 2, 10);

  const aspect = window.innerWidth / window.innerHeight;
  camera = new PerspectiveCamera(75, aspect, 0.1, 10); // meters
  camera.position.set(0, 1.6, 3);

  // Lights
  const light = new AmbientLight(0xffffff, 1.0); // soft white light
  scene.add(light);

  const dirLight = new DirectionalLight(0xffffff, 1);
  dirLight.position.set(10, 10, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // const ambientLight = new AmbientLight(0x404040);
  // scene.add(ambientLight);

  const hemiLight = new HemisphereLight(0xffffff, 0xbbbbff, 3);
  hemiLight.position.set(0.5, 1, 0.25);
  scene.add(hemiLight);

  window.addEventListener('resize', onWindowResize, false);

}

const initXR = () => {
  renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;


  renderer.setAnimationLoop(gameLoop); // requestAnimationFrame() replacement, compatible with XR 
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  /*
  document.body.appendChild( XRButton.createButton( renderer, {
    'optionalFeatures': [ 'depth-sensing' ],
    'depthSensing': { 'usagePreference': [ 'gpu-optimized' ], 'dataFormatPreference': [] }
  } ) );
*/

  const xrButton = XRButton.createButton(renderer, {});
  xrButton.style.backgroundColor = 'skyblue';
  document.body.appendChild(xrButton);

  // const controls = new OrbitControls(camera, renderer.domElement);
  // //controls.listenToKeyEvents(window); // optional
  // controls.target.set(0, 1.6, 0);
  // controls.update();

  // Handle input: see THREE.js webxr_ar_cones

  // const geometry = new CylinderGeometry(0, 0.05, 0.2, 32).rotateX(Math.PI / 2);

  // const onSelect = (event) => {

  //   const material = new MeshPhongMaterial({ color: 0xffffff * Math.random() });
  //   const mesh = new Mesh(geometry, material);
  //   mesh.position.set(0, 0, - 0.3).applyMatrix4(controller.matrixWorld);
  //   mesh.quaternion.setFromRotationMatrix(controller.matrixWorld);
  //   scene.add(mesh);

  // }

  // controller = renderer.xr.getController(0);
  // controller.addEventListener('select', onSelect);
  // scene.add(controller);
}


// TODO: find alternative to wireframe (displays trinagles) and Edges Geometry only one huge quad)
// Ideally we'd like to have quads.
const initFloor = () => {

  const floor = new Mesh(
    new PlaneGeometry(3, 3, 30, 30),
    new MeshBasicMaterial({
      color: COLORS.MAGENTA,
      wireframe: true
    })
  );
  floor.rotation.x = Math.PI / -2;
  floor.position.y = groundY - 0.001;

  scene.add(floor);

  // Ground for shadows
  // TODO: check AR Shadow
  const groundMat = new ShadowMaterial({ opacity: 0.4 });
  const groundGeo = new PlaneGeometry(3, 3);
  const ground = new Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = groundY;
  ground.receiveShadow = true;
  scene.add(ground);

}

const initCubes = () => {

  const boxGeometry = new BoxGeometry(0.25, 0.25, 0.25);

  for (let i = 0; i < 5; i++) {

    cubes.push(new Mesh(boxGeometry, new MeshBasicMaterial({ color: COLORS.BLUE })));

    const curCube = cubes[i];
    resetCube(curCube);

    curCube.userData.type = 'cube';
    collidableMeshList.push(curCube);
    curCube.castShadow = true;
    curCube.receiveShadow = true;
    scene.add(curCube);
  }

  scheduleCubesRespawn();


}

const resetCube = (cube) => {
  cube.visible = false;
  cube.userData.active = false;
  cube.position.z = -100;
  cube.position.x = Math.random() * 2 - 0.5;
  cube.position.y = Math.random() * 1 + 0.5;
}

const scheduleCubesRespawn = () => {
  setInterval(() => {
    for (let i = 0; i < 5; i++) {
      if (cubes[i].userData.active === false) {
        cubes[i].userData.active = true
        cubes[i].visible = true
        break
      }
    }
  }, 250 * 100 / CUBE_ANIMATION_SPEED)

}


function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

}

////

init();
initXR();
initFloor();
initCubes();
