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
  GridHelper,
  HemisphereLight,
  Matrix3,
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

//import { OrbitControls } from './OrbitControls'; //TODO: FIXME: DEBUG only, remove from build!

import { XRHandModelFactory } from './XRHandModelFactory.js';

//const DEBUG_MODE = import.meta.env.DEV;
const DEBUG_MODE = false;

let camera, scene, renderer;
let controller;
const MAX_CUBES = 20;
const CUBE_SIZE_m = 0.25;
const CUBE_MASS_kg = 0.5 * CUBE_SIZE_m;
const CUBE_MAX_Z_m = 3 / 2;
const cubes = [];
const collidableMeshList = [];

const minSizeForBreak = CUBE_SIZE_m / 100;
const objectBreaker = new ConvexObjectBreaker();
let shards = [];
let originalCube = null;

const gravity = -9.81; // gravity (meters per second^2)
const groundY = 0.0; // ground level

// Palette inspired by Takenobu Igarashi
const COLORS = {
  RED: 0xc84231,
  GREEN: 0x7cbc70,
  BLUE: 0x1c9ec3,
  MAGENTA: 0xae4c9d,
  YELLOW: 0xfcc245
};

const pieceColors = [0xFFC185, 0xB4413C, 0xECEBD5, 0xDB4545, 0xD2BA4C, 0x964325];

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
let onDownPosition3DNormal = new Vector3();
let cutStart;
let cutEnd;
let debugCube;
let isPointerDown = false;

let closestCube;
let cubeToCut;

const clock = new Clock();

// Main loop
const gameLoop = () => {

  const delta_s = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  if (_cubeAnimation) {
    animateCubes(delta_s);
  }
  // can be used in shaders: uniforms.u_time.value = elapsed;

  //updateClaws();

  //updateTrails();

  // TODO: FIXME
  //checkHandCollisions();

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
  camera = new PerspectiveCamera(75, aspect, 0.1, 4 * CUBE_MAX_Z_m); // meters
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



  const origin = new Mesh(new BoxGeometry(CUBE_SIZE_m / 2, CUBE_SIZE_m / 2, CUBE_SIZE_m / 2),
    new MeshBasicMaterial({ color: 0xffffff }));
  if (DEBUG_MODE) { scene.add(origin); }

  cutStart = new Mesh(new BoxGeometry(CUBE_SIZE_m / 8, CUBE_SIZE_m / 8, CUBE_SIZE_m / 8),
    new MeshBasicMaterial({ color: 0xff0000 }));
  if (DEBUG_MODE) { scene.add(cutStart); }

  cutEnd = new Mesh(new BoxGeometry(CUBE_SIZE_m / 8, CUBE_SIZE_m / 8, CUBE_SIZE_m / 8),
    new MeshBasicMaterial({ color: 0x00ff00 }));
  if (DEBUG_MODE) { scene.add(cutEnd); }

  debugCube = new Mesh(new BoxGeometry(CUBE_SIZE_m * 10, CUBE_SIZE_m * 10, CUBE_SIZE_m * 10),
    new MeshBasicMaterial({ color: 0x0000ff }));
  debugCube.position.z = - CUBE_SIZE_m * 15;
  debugCube.userData.type = 'cube';
  //if (DEBUG_MODE) { scene.add(debugCube); }



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
    'optionalFeatures': ['hand-tracking']
  };

  const xrButton = XRButton.createButton(renderer, sessionInit);
  xrButton.style.backgroundColor = 'skyblue';
  //xrButton.style.opacity = 0.0; // TODO: set opacity to zero for sreen capture
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

  const divisions = 10;

  const floor = new GridHelper(PLANE_SIZE_m, divisions, COLORS.MAGENTA, COLORS.MAGENTA);

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


const createPlaneAtPosition = (position) => {

  const normal = new Vector3(
    0.0,
    1.0,
    0.0
  );

  planes.push(new Plane().setFromNormalAndCoplanarPoint(
    normal,
    position
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
    const helper = new PlaneHelper(plane, CUBE_SIZE_m * 2, 0xffff00);
    planehelpers.push(helper);
    scene.add(helper);
  });

}


const cleanShards = () => {
  for (const shard of shards) {
    if (shard)
      scene.remove(shard.mesh);
    shard.mesh.geometry.dispose();
    shard.mesh.material.dispose();
  }

  //shards = [];

}

const sliceCube = (cubeMesh, planes) => {

  if (!cubeMesh) { return; }


  cleanShards();

  // originalCube = cubeMesh;

  // Prepare breakable object (mass, velocity, angular velocity)
  const velocity = new Vector3(0, 0, CUBE_SPEED_mps); // TODO: add cube velocity here instead of adding it in updateCubePhysics?
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
        // Reset original before slicing
        resetCube(obj);

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
  objectsToCut.forEach((/** @type Mesh*/ slice, idx) => {

    slice.castShadow = true;
    slice.receiveShadow = true;

    // Assign random slice color from palette
    const color = pieceColors[idx % pieceColors.length];
    slice.material = new MeshPhysicalMaterial({ color: color });

    // Prepare breakable for physics 
    slice.geometry.computeBoundingBox();
    const sliceSize = new Vector3();
    slice.geometry.boundingBox.getSize(sliceSize);

    const mass = CUBE_MASS_kg / sliceSize.x * sliceSize.y * sliceSize.z; // mass proportional to cube size

    const p_0 = onDownPosition3D; // cutStart
    const v_01 = onUpPosition3D.clone().sub(p_0);  // cutEnd - cutStart
    const cutLength = v_01.length();

    const v_02 = onDownPosition3DNormal.clone(); // normal to the face at cutStart

    const velocityScale = mass * 100;
    const sign = v_01.normalize().cross(v_02.normalize()).z < 0 ? -1 : 1;
    const cutScale = Math.min(cutLength, CUBE_SIZE_m * 2);
    const velocity = planes[0].normal.clone().multiplyScalar(-sign * cutScale * velocityScale); // use slicing direction and length for best effect

    const angularVelocityScale = mass * 100;
    const angularVelocity = planes[0].normal.clone().multiplyScalar(-cutScale * angularVelocityScale);


    objectBreaker.prepareBreakableObject(slice, mass, velocity, angularVelocity, true);

    scene.add(slice);

    // Store physics state per piece
    shards.push({
      mesh: slice,
      velocity: velocity,
      angularVelocity: angularVelocity,
      active: true
    });
  });
}

const updateCubePhysics = (delta_s) => {
  // Update physics of falling pieces
  for (const shard of shards) {

    if (shard.active) {
      // Gravity effect
      shard.velocity.y += gravity * delta_s;

      // Update position
      shard.mesh.position.addScaledVector(shard.velocity, delta_s);

      if (shard.mesh.position.y > groundY) {
        shard.mesh.position.z += CUBE_SPEED_mps * delta_s;
      }

      // Update rotation by angular velocity
      shard.mesh.rotation.x += shard.angularVelocity.x * delta_s;
      shard.mesh.rotation.y += shard.angularVelocity.y * delta_s;
      shard.mesh.rotation.z += shard.angularVelocity.z * delta_s;

      // Collision with ground plane
      if (shard.mesh.position.y < groundY) {
        shard.mesh.position.y = groundY;
        shard.velocity.y = 0;

        // Dampen angular velocity to simulate friction
        shard.angularVelocity.multiplyScalar(0.7);
        shard.velocity.x *= 0.7;
        shard.velocity.z *= 0.7;


        shard.active = false;
        shard.mesh.visible = false;
      }


      // TODO: split shards using subdivideByImpact when they hit the ground?
      // function getCenterPoint(mesh) {
      //   var geometry = mesh.geometry;
      //   geometry.computeBoundingBox();
      //   var center = new Vector3();
      //   geometry.boundingBox.getCenter(center);
      //   mesh.localToWorld(center);
      //   return center;
      // }

      // const n = new Vector3(0, 1, 0);
      // const shards = objectBreaker.subdivideByImpact(
      //   shard.mesh,
      //   getCenterPoint(shard.mesh),
      //   n.multiplyScalar(10),
      //   1,
      //   0
      // )



    }
  }

  const activeShards = shards.map((shard) => (shard.active));
  if (activeShards.every((val) => (val == false))) {
    cleanShards();
  }

}





const createPlanesFromPoints = (a, b, c) => {

  if (!a || !b || !c) { return; }

  const plane = new Plane().setFromCoplanarPoints(a, b, c);

  // compute plane normal
  const normal = plane.normal;

  normal.normalize();

  // space between slices
  const spacing = CUBE_SIZE_m / 4; // space between planes 


  // Create parallel planes by offsetting points a and b (start and end of cut) while keeping c (camera / wrist / shoulder) constant
  const offsets = [-1.5 * spacing, -0.5 * spacing, 0.5 * spacing, 1.5 * spacing];


  planes = offsets.map(offset => new Plane().setFromCoplanarPoints(
    a.clone().add(normal.clone().multiplyScalar(offset)),
    b.clone().add(normal.clone().multiplyScalar(offset)),
    c
  ));

  //planes = [plane];

  //updatePlaneHelpers();

}

////
// Hands
////

//
// scene
//  |
//  +- hand : Group representing the hand space of the WebXR Controller (XRHand)
//      |   +- this.joints : array with the WebXR joints
//      | 
//      +- handModel : XRHandModel created by XRHandModelFactory
//      |   +- this.controller : hand 
//      |   +- his.envMap : null
//      |   +- this.mesh : handMesh
//      |   +- this.motionController : XRHandPrimitiveModel created by XRHandModelFactory
//      |            +- this.controller : hand
//      |            +- this.handModel : handModel
//      |            +- this.handMesh : handMesh
//      |            +- this.envMap : null
//      |            +- this.joints : array with the name of the joints using WebXR naming for easy access
//      |
//      +- handMesh : InstancedMesh containing all the joints, created by XRHandPrimitiveModel and added to SceneGraph by HandModel
//



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
  setupClaws(hand0, 'hand0');
  setupClaws(hand1, 'hand1');
}


const fingertipNames = [
  "index-finger-tip",
  "middle-finger-tip",
  "ring-finger-tip",
  "pinky-finger-tip"
];


function setupClaws(hand, handId) {
  claws[handId] = [];

  const clawGeometry = new CylinderGeometry(0.01, 0.03, 0.5, 4);


  for (const jointName of fingertipNames) {

    const joint = hand.joints[jointName];

    const clawMaterial = new MeshBasicMaterial({
      color: jointName === 'index-finger-tip' ? 0xff0066 : 0x00ffff,
      transparent: false,
      opacity: 1.0
    });

    const claw = new Mesh(clawGeometry, clawMaterial);
    //claw.position.set(0, 0.025, 0); // Extend from fingertip
    claw.visible = false;
    claws[handId][jointName] = claw;
    collidableMeshList.push(claw);
    scene.add(claw); // adding to scene, we'll be using global transformations
  }
}

const trail = [];
let tIdx = 0;
const MAX_TRAIL_POINTS = 50;
function setupTrails() {
  for (tIdx = 0; tIdx < MAX_TRAIL_POINTS; tIdx++) {

    var geometry = new BoxGeometry(0.005, 0.005, 0.005);
    trail[tIdx] = new Mesh(geometry, new MeshBasicMaterial({ color: COLORS.RED }));
    trail[tIdx].material.wireframe = true;
    trail[tIdx].position.x = 0;
    trail[tIdx].position.y = 0;
    trail[tIdx].position.z = 0;
    scene.add(trail[tIdx]);

  }

  tIdx = 0;


}

function isEmpty(obj) {
  for (const i in obj) return false;
  return true;

}

function updateTrails() {

  if (isEmpty(hand1.joints)) { return; }

  trail[tIdx % MAX_TRAIL_POINTS].position.x = hand1.joints['index-finger-tip'].position.x;
  trail[tIdx % MAX_TRAIL_POINTS].position.y = hand1.joints['index-finger-tip'].position.y;
  trail[tIdx % MAX_TRAIL_POINTS].position.z = hand1.joints['index-finger-tip'].position.z;

  trail[tIdx % MAX_TRAIL_POINTS].quaternion.x = hand1.joints['index-finger-tip'].quaternion.x;
  trail[tIdx % MAX_TRAIL_POINTS].quaternion.y = hand1.joints['index-finger-tip'].quaternion.y;
  trail[tIdx % MAX_TRAIL_POINTS].quaternion.z = hand1.joints['index-finger-tip'].quaternion.z;
  trail[tIdx % MAX_TRAIL_POINTS].quaternion.w = hand1.joints['index-finger-tip'].quaternion.w;

  tIdx++;

}



function updateClaws() {

  [[hand0, 'hand0'], [hand1, 'hand1']].forEach((hand, handId) => {

    for (const jointName of fingertipNames) {

      if (!isEmpty(hand.joints)) {
        const joint = hand.joints[jointName];

        const claw = claws[handId][jointName];
        claw.position.set(joint.position.x, joint.position.y, joint.position.z); // Extend from fingertip
        claw.visible = true;
      }
    }

  });
}


const TOUCH_RADIUS = 0.01;
const POINTING_JOINT = 'index-finger-tip';

function getPointerPosition(hand, pointingJoint) {

  const pointer = hand.joints[pointingJoint];
  if (pointer) {

    return pointer.position;

  }
}

// function computePlanes(hand) {

//   const joints = hand.joints;

//   let count = 0;

//   for (let i = 0; i < joints.length; i++) {

//     const joint = joints[i];

//     if (joint?.visible) {

//       // _vector.setScalar(joint.jointRadius || defaultRadius);
//       // _matrix.compose(joint.position, joint.quaternion, _vector);
//       // this.handMesh.setMatrixAt(i, _matrix);

//       // count++;

//     }

//   }
//   createPlanes();

//   return planes;
// }


function computePlanes(hand) {

  const joints = hand.joints;

  let count = 0;

  for (const fingertip in fingertipNames) {

    const joint = joints[fingertip];

    if (joint?.visible) {


      createPlaneAtPosition(getPointerPosition(hand, joint));

    }

  }


  return planes;
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

  if (!hands.length) { return; }

  hands.forEach(hand => {

    if (hand) {

      cubes.forEach((c) => {

        // Find out which state we are in according to previous values of down and up

        if (intersectBoxObject(hand, c)) { // if collision

          if (!isPointerDown) {
            // cutStart
            onDownPosition3D = getPointerPosition(hand, POINTING_JOINT);
            //onUpPosition = null; // TODO: CHECK: should be put to null?
            isPointerDown = true;
          }

          // cutMove
          onUpPosition3D = getPointerPosition(hand, POINTING_JOINT);

        }
        else { // no collision
          if (isPointerDown) {
            // cutEnd

            // TODO: FIXME
            // const clawPlanes = computePlanes(hand);
            // sliceCube(c, clawPlanes);


            createPlanesFromPoints(onDownPosition3D, onUpPosition3D, camera.position);
            sliceCube(c, planes);

            isPointerDown = false;
          }

        }
      });
    }
  });

}

///////

let _cubeAnimation = true;
const toggleCubeAnimation = () => {
  _cubeAnimation = !_cubeAnimation;
}

const setupEventListeners = () => {
  window.addEventListener('resize', onWindowResize, false);


  if (true) {
    window.addEventListener('keydown', e => {

      if (e.code === 'Space') {
        toggleCubeAnimation();
      }
    });
  }


  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointermove', onPointerMove);
}


function onPointerDown(event) {

  onDownPosition.x = event.clientX;
  onDownPosition.y = event.clientY;

  onDownPosition3D = null;
  onDownPosition3DNormal = null;
  isPointerDown = true;

}

function onPointerUp(event) {

  isPointerDown = false;

  onUpPosition.x = event.clientX;
  onUpPosition.y = event.clientY;

  cutEnd.position.set(onUpPosition3D.x, onUpPosition3D.y, onUpPosition3D.z);

  createPlanesFromPoints(onDownPosition3D, onUpPosition3D, camera.position);
  sliceCube(cubeToCut, planes);

  cubeToCut = null;
}



// inspired by VertexNormalsHelper
const _normalMatrix = new Matrix3();
const getWorldNormal = (object, position_W, normal) => {

  const normal_W = normal.clone();

  object.updateMatrixWorld(true);

  _normalMatrix.getNormalMatrix(object.matrixWorld);

  normal_W.applyMatrix3(_normalMatrix).normalize().add(position_W);


  return normal_W;
};


const onPointerMove = (event) => {

  if (!isPointerDown) { return; }

  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera); // in 3D don't use camera but the direction of the nail

  //const intersects = raycaster.intersectObjects([...cubes, debugCube], false);
  const intersects = raycaster.intersectObjects(cubes, false);
  if (intersects.length > 0) {

    const object = intersects[0].object;

    if (object && object.userData.type === 'cube') {

      if (!onDownPosition3D) {
        onDownPosition3D = intersects[0].point; // start

        intersects[0].object.updateMatrixWorld(true);

        onDownPosition3DNormal = getWorldNormal(intersects[0].object, onDownPosition3D, intersects[0].normal);
        cutStart.position.set(onDownPosition3D.x, onDownPosition3D.y, onDownPosition3D.z);

      }

      onUpPosition3D = intersects[0].point; // current

      cubeToCut = object;

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
setupTrails();
setupEventListeners();
