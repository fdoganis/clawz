"use strict";

// Import only what you need, to help your bundler optimize final code size using tree shaking
// see https://developer.mozilla.org/en-US/docs/Glossary/Tree_shaking)

import {
  AmbientLight,
  Box3,
  BoxGeometry,
  Clock,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneHelper,
  PlaneGeometry,
  Raycaster,
  Scene,
  ShadowMaterial,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';

// TODO: FIXME: include proper link in final version
// Oh no!!! Emulators are KO in THREE.js 179 !
// OK in 178 and 180
// XR
//import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRButton } from './XRButton.js';

// Cube slicing code
// https://github.com/mrdoob/three.js/blob/r179/examples/jsm/math/ConvexHull.js
// https://github.com/mrdoob/three.js/blob/r179/examples/jsm/geometries/ConvexGeometry.js
// https://github.com/mrdoob/three.js/blob/r179/examples/jsm/misc/ConvexObjectBreaker.js

import { ConvexObjectBreaker } from './ConvexObjectBreaker.js';

import { OrbitControls } from './OrbitControls'; //TODO: FIXME: DEBUG only, remove from build!

import { XRHandModelFactory } from './XRHandModelFactory.js';

const objectBreaker = new ConvexObjectBreaker();
let fallingPieces = [];
let originalCube = null;

const gravity = -9.81; // gravity (meters per second^2)
const groundY = 0.0; // ground level

// TODO: FIXME: debug colors
const pieceColors = [
  0xFFC185, 0xB4413C, 0xECEBD5, 0xDB4545, 0xD2BA4C, 0x964325
];

// const pieceColors = [
//   0x1cbfc3, 0x1cafc3, 0x1cbcc3, 0x1c9ec3,
// ];


// TODO: FIXME: DEBUG
const planehelpers = [];
let curHandPos;
let yOffset;
let planes = [];

// Hands
let hand0;
let hand1;
const hands = [];
let claws = {};
const handModelFactory = new XRHandModelFactory();

// Mouse emulation
const raycaster = new Raycaster();
const pointer = new Vector2();
const onUpPosition = new Vector2();
const onDownPosition = new Vector2();
let onUpPosition3D = new Vector3();
let onDownPosition3D = new Vector3();


let camera, scene, renderer;
let controller;
const MAX_CUBES = 20;
const CUBE_SIZE_m = 0.25;
const CUBE_MASS_kg = 0.5 * CUBE_SIZE_m;
const CUBE_MAX_Z_m = 3 / 2;
const cubes = [];
const collidableMeshList = [];

let closestCube;

// Palette inspired by Takenobu Igarashi
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

  const delta_s = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  animateCubes(delta_s);

  // can be used in shaders: uniforms.u_time.value = elapsed;

  checkHandCollisions();

  updateCubePhysics(delta_s);

  renderer.render(scene, camera);
};



const CUBE_SPEED_mps = 1;
//const CUBE_SPAWN_RATE = 250 * 100 / CUBE_ANIMATION_SPEED;
const CUBE_SPAWN_DELAY_ms = 250;

const animateCubes = (delta_s) => {

  // speed = distance / elapsed_time
  //       = (new_pos - old_pos) / delta_time
  //
  // new_pos = old_pos + speed * delta_time
  cubes.forEach((c) => {
    if (c.userData.active) {
      c.position.z += CUBE_SPEED_mps * delta_s;

      if (!closestCube) { closestCube = c; }
      else {
        if (c.position.z > closestCube.position.z) {
          closestCube = c;
        }
      }

      if (c.position.z > CUBE_MAX_Z_m) {
        resetCube(c);
      }
    }
  })
}

const initScene = () => {
  scene = new Scene();

  scene.backgroundColor = 0x000;

  //scene.fog = new Fog(0xffffff, 2, 10);

  const aspect = window.innerWidth / window.innerHeight;
  camera = new PerspectiveCamera(75, aspect, 0.1, CUBE_MAX_Z_m); // meters
  camera.position.set(0, 1.6, CUBE_MAX_Z_m);

  // Lights
  const light = new AmbientLight(0xffffff, 1.0); // soft white light
  scene.add(light);

  const dirLight = new DirectionalLight(0xffffff, 1);
  dirLight.position.set(0, 10, 0);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // const ambientLight = new AmbientLight(0x404040);
  // scene.add(ambientLight);

  const hemiLight = new HemisphereLight(0xffffff, COLORS.MAGENTA, 3);
  hemiLight.position.set(0.5, 1, 0.25);
  scene.add(hemiLight);


  // TODO: FIXME: DEBUG
  const origin = new Mesh(new BoxGeometry(CUBE_SIZE_m / 2, CUBE_SIZE_m / 2, CUBE_SIZE_m / 2),
    new MeshBasicMaterial({ color: 0xffffff }));
  scene.add(origin);

}

const initRenderer = () => {
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


  const sessionInit = {
    requiredFeatures: ['hand-tracking']
  };

  const xrButton = XRButton.createButton(renderer, sessionInit);
  xrButton.style.backgroundColor = 'skyblue';
  //xrButton.style.opacity = 0.0; // TODO: FIXME: sreen capture
  document.body.appendChild(xrButton);

  // const controls = new OrbitControls(camera, renderer.domElement);
  // // //controls.listenToKeyEvents(window); // optional
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


// TODO: find alternative to wireframe (displays triangles) and Edges Geometry (displays only one huge quad)
// Ideally we'd like to have quads: see helper?
const initFloor = () => {

  const PLANE_SIZE_m = CUBE_MAX_Z_m * 2;

  const floor = new Mesh(
    new PlaneGeometry(PLANE_SIZE_m, PLANE_SIZE_m, 10 * PLANE_SIZE_m, 10 * PLANE_SIZE_m),
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

  const boxGeometry = new BoxGeometry(CUBE_SIZE_m, CUBE_SIZE_m, CUBE_SIZE_m);

  for (let i = 0; i < MAX_CUBES; i++) {

    cubes.push(new Mesh(
      boxGeometry,
      new MeshPhysicalMaterial({ color: COLORS.BLUE })
    ));

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
  cube.position.z = -CUBE_MAX_Z_m;
  cube.position.x = (Math.random() - 0.5) * 2; // [-1m; 1m]
  cube.position.y = Math.random() * 0.75 + 1; // [1m; 1.75m]
}

const scheduleCubesRespawn = () => {
  setInterval(() => {
    for (let i = 0; i < MAX_CUBES; i++) {
      if (cubes[i].userData.active === false) {
        cubes[i].userData.active = true
        cubes[i].visible = true
        break
      }
    }
  }, CUBE_SPAWN_DELAY_ms)

}


const createPlanes = () => {
  // Generate 4 parallel planes with random orientation
  // Random normal vector (unit length)
  const normal = new Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5
  ).normalize();

  // Distance spacing to create slices
  // We'll space slices evenly within the cube's bounding extent
  const spacing = CUBE_SIZE_m / 4; // space between planes

  // Calculate plane constants so planes cut through cube centered roughly on origin
  // Starting point offset so that planes cover the cube's roughly 1 unit size along that normal
  const offsets = [-1.5 * spacing, -0.5 * spacing, 0.5 * spacing, 1.5 * spacing];

  yOffset = new Vector3(0.0, 1.6, 0.0);
  planes = offsets.map(offset => new Plane().setFromNormalAndCoplanarPoint(
    normal,
    normal.clone().multiplyScalar(offset).add(yOffset)
  ));

  updatePlaneHelpers();
}

const updatePlaneHelpers = () => {
  planehelpers.forEach((helper) => {
    scene.remove(helper);
    helper.geometry.dispose();
    helper.material.dispose();

  });

  planes.forEach((plane) => {
    const helper = new PlaneHelper(plane, 1, 0xffff00);
    planehelpers.push(helper);
    scene.add(helper);
  });

}


const sliceClosestCube = () => {

  createPlanes();

  closestCube = null;
  cubes.forEach((c) => {
    if (!closestCube) { closestCube = c }
    else {
      if (c.position.distanceTo(yOffset) < closestCube.position.distanceTo(yOffset)) {
        closestCube = c;
      }
    }
  });
  // find closest cube
  sliceCube(closestCube);
}

const sliceCube = (cubeMesh) => {
  // Clear existing pieces from scene and reset
  // if (originalCube) {
  //   scene.remove(originalCube);
  //   originalCube.geometry.dispose();
  //   originalCube.material.dispose();
  //   originalCube = null;
  // }

  // if (originalCube) {
  //   resetCube(originalCube);
  // }

  for (const piece of fallingPieces) {
    scene.remove(piece.mesh);
    piece.mesh.geometry.dispose();
    piece.mesh.material.dispose();
  }

  fallingPieces = [];

  // originalCube = cubeMesh;

  // Prepare breakable object (mass, velocity, angular velocity)
  const velocity = new Vector3(0, 0, 0);
  const angularVelocity = new Vector3(0, 0, 0);
  objectBreaker.prepareBreakableObject(cubeMesh, CUBE_MASS_kg, velocity, angularVelocity, true);



  // Use sequential cutting to slice the cube with these planes
  // Start with an array containing the single original cube
  let objectsToCut = [cubeMesh];

  for (const plane of planes) {
    let nextObjects = [];
    for (const obj of objectsToCut) {
      let result = { object1: null, object2: null };
      let cutCount = objectBreaker.cutByPlane(obj, plane, result);
      if (cutCount === 2) {
        // Remove original before slicing
        scene.remove(obj);
        obj.geometry.dispose();
        obj.material.dispose();

        // Add both pieces to next stage
        if (result.object1) nextObjects.push(result.object1);
        if (result.object2) nextObjects.push(result.object2);
      } else {
        // No cut, keep the original object
        nextObjects.push(obj);
      }
    }
    objectsToCut = nextObjects;
  }

  // Now objectsToCut contains the slices

  // Remove the original cube reference as all are slices now.
  // originalCube = null;

  // Add slices to scene, setup physics params for animation
  objectsToCut.forEach((slice, idx) => {
    slice.castShadow = true;
    slice.receiveShadow = true;

    // Assign random slice color from palette
    const color = pieceColors[idx % pieceColors.length];
    slice.material = new MeshPhysicalMaterial({ color: color });

    // Prepare breakable for physics (mass 1 unit here for gravity sim)
    const mass = CUBE_MASS_kg; // mass proportional to cube size
    const velocity = new Vector3(
      (Math.random() - 0.5) * 0.2,
      Math.random() * 0.2,
      (Math.random() - 0.5) * 0.2
    );

    const angularVelocity = new Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    );
    objectBreaker.prepareBreakableObject(slice, mass, velocity, angularVelocity, true);

    scene.add(slice);

    // Store physics state per piece
    fallingPieces.push({
      mesh: slice,
      velocity: velocity,
      angularVelocity: angularVelocity,
    });
  });
}

const updateCubePhysics = (delta_s) => {
  // Update physics of falling pieces
  for (const piece of fallingPieces) {
    // Gravity effect
    piece.velocity.y += gravity * delta_s; // TODO: compute actual mass for more accuracy

    // Update position
    piece.mesh.position.addScaledVector(piece.velocity, delta_s);

    if (piece.mesh.position.y > groundY) {
      piece.mesh.position.z += CUBE_SPEED_mps * delta_s;
    }

    // Update rotation by angular velocity
    piece.mesh.rotation.x += piece.angularVelocity.x * delta_s;
    piece.mesh.rotation.y += piece.angularVelocity.y * delta_s;
    piece.mesh.rotation.z += piece.angularVelocity.z * delta_s;

    // Collision with ground plane
    if (piece.mesh.position.y < groundY) {
      piece.mesh.position.y = groundY;
      piece.velocity.y = 0;

      // Dampen angular velocity to simulate friction
      piece.angularVelocity.multiplyScalar(0.7);
      piece.velocity.x *= 0.7;
      piece.velocity.z *= 0.7;
    }
  }

}



const createPlanesFromPoints = (a, b, c) => {

  // compute plane normal
  // Generate 4 parallel planes 
  planes = [new Plane().setFromCoplanarPoints(a, b, c)];

  // Distance spacing to create slices
  // We'll space slices evenly within the cube's bounding extent
  const spacing = CUBE_SIZE_m / 4; // space between planes

  // Calculate plane constants so planes cut through cube centered roughly on origin
  // Starting point offset so that planes cover the cube's roughly 1 unit size along that normal
  const offsets = [-1.5 * spacing, -0.5 * spacing, 0.5 * spacing, 1.5 * spacing];

  //yOffset = new Vector3(0.0, 1.6, 0.0);
  // planes = offsets.map(offset => new Plane().setFromNormalAndCoplanarPoint(
  //   normal,
  //   normal.clone().multiplyScalar(offset).add(yOffset)
  // ));

  updatePlaneHelpers();

}

////
// Hands
////

function setupHands() {

  hand0 = renderer.xr.getHand(0);
  hand0.add(handModelFactory.createHandModel(hand0, 'boxes'));
  scene.add(hand0);
  hands.push(hand0);


  hand1 = renderer.xr.getHand(1);
  hand1.add(handModelFactory.createHandModel(hand1, 'boxes'));
  scene.add(hand1);
  hands.push(hand1);



  // Claws on fingertips
  //setupClaws(hand0, 'hand0');
  //setupClaws(hand1, 'hand1');
}


function setupClaws(hand, handId) {
  claws[handId] = {};

  const clawGeometry = new THREE.CylinderGeometry(0.001, 0.003, 0.05, 6);
  const clawMaterial = new THREE.MeshBasicMaterial({
    color: jointName === 'index-finger-tip' ? 0xff0066 : 0x00ffff,
    transparent: false,
    opacity: 1.0
  });

  const jointNames = [
    "index-finger-tip",
    "middle-finger-tip",
    "ring-finger-tip",
    "pinky-finger-tip"
  ];

  for (const jointName of jointNames) {

    const joint = hand.get(jointName);

    const claw = new THREE.Mesh(clawGeometry, clawMaterial);
    claw.position.set(0, 0.025, 0); // Extend from fingertip
    claw.visible = true;
    claws[handId][jointName] = claw;
    collidableMeshList.push(claw);
    hand.add(claw);
  }
}

const TOUCH_RADIUS = 0.01;
const POINTING_JOINT = 'index-finger-tip';

function getPointerPosition(hand, pointingJoint) {

  const indexFingerTip = hand.joints[pointingJoint];
  if (indexFingerTip) {

    return indexFingerTip.position;

  }
}

function intersectBoxObject(hand, boxObject) {

  const pointerPosition = getPointerPosition(hand, POINTING_JOINT);
  if (pointerPosition) {

    const indexSphere = new Sphere(pointerPosition, TOUCH_RADIUS);
    const box = new Box3().setFromObject(boxObject);
    return indexSphere.intersectsBox(box);

  } else {

    return false;

  }

}

function checkHandCollisions() {
  hands.forEach(hand => {

    cubes.forEach((c) => {
      if (hand && intersectBoxObject(hand, c)) {

        sliceCube(c);

        //const pressingPosition = hand.getPointerPosition();
        //pressingDistances.push(button.surfaceY - object.worldToLocal(pressingPosition).y);

      }
    });


  });
}

///////


const setupEventListeners = () => {
  window.addEventListener('resize', onWindowResize, false);

  // renderer.domElement.addEventListener('click', () => {
  //   sliceClosestCube()
  // });

  window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      sliceClosestCube()
    }
  });


  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointermove', onPointerMove);
}


function onPointerDown(event) {

  onDownPosition.x = event.clientX;
  onDownPosition.y = event.clientY;

}

function onPointerUp(event) {

  onUpPosition.x = event.clientX;
  onUpPosition.y = event.clientY;

  // if (onDownPosition.distanceTo(onUpPosition) === 0) {

  //   transformControl.detach();
  //   render();

  // }

  createPlanesFromPoints(onDownPosition3D, onUpPosition3D, camera.position);
  sliceCube(closestCube);
  closestCube = null;
}





const onPointerMove = (event) => {

  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera); // in 3D don't use camera but the direction of the nail

  const intersects = raycaster.intersectObjects(cubes, false);

  if (intersects.length > 0) {

    const object = intersects[0].object;

    if (object.userData.type === 'cube') {

      if (!onDownPosition3D) {
        onDownPosition3D = intersects[0].point; // start
      }

      onUpPosition3D = intersects[0].point; // current

      if (!closestCube) {
        closestCube = object;
      }


    }

  }

}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);

}

////

initRenderer();
initScene();
initFloor();
initCubes();
setupHands();
setupEventListeners();
