// a,b,c,d,tx,ty
export type SimpleMatrix6 = [number, number, number, number, number, number];
/*
row1:  [ a  c  tx ]
row2:  [ b  d  ty ]
row3:  [ 0  0   1 ]
*/
export const Matrix = {
  identity: Object.freeze([1, 0, 0, 1, 0, 0]) as unknown as SimpleMatrix6,

  translate: (tx: number, ty: number): SimpleMatrix6 => [1, 0, 0, 1, tx, ty],

  scale: (sx: number, sy: number): SimpleMatrix6 => [sx, 0, 0, sy, 0, 0],

  rotate(rad: number): SimpleMatrix6 {
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [cos, sin, -sin, cos, 0, 0];
  },

  multiply(a: SimpleMatrix6, b: SimpleMatrix6): SimpleMatrix6 {
    return [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
  },

  inverse(mat: SimpleMatrix6): SimpleMatrix6 {
    const det = mat[0] * mat[3] - mat[1] * mat[2];
    if (det === 0) return [...Matrix.identity] as SimpleMatrix6;

    const inv = 1 / det;

    // 线性部分的逆
    const linearInv: SimpleMatrix6 = [
       mat[3] * inv,
      -mat[1] * inv,
      -mat[2] * inv,
       mat[0] * inv,
      0,//(c*ty-tx*d)* inv
      0,//(tx*b-a*ty)* inv
    ];

    // M⁻¹ = L⁻¹ · T(-tx,-ty)
    return Matrix.multiply(
        linearInv,
        Matrix.translate(-mat[4], -mat[5])
    );
  },

  transformPoint(mat: SimpleMatrix6, x: number, y: number) {
    // const m = Matrix.translate(x,y);
    // const P = Matrix.multiply(mat, m);
    // return {
    //   x: P[4],
    //   y: P[5],
    // };
    return {
      x: mat[0] * x + mat[2] * y + mat[4],
      y: mat[1] * x + mat[3] * y + mat[5]
    }
  },
};

export function degreeToRad(angle: number): number {
  return -angle * (Math.PI / 180);
}

export const col1 = [77.74, 32.9];
export const col2 = [-62.35, 37.1];


export function toGridCoords(
    X: number,
    Y: number,
    snap: boolean
): { col: number; row: number } {


  const M: SimpleMatrix6 = [
    col1[0], col1[1],
    col2[0], col2[1],
    0, 0,
  ];

  const inv = Matrix.inverse(M);

  const p = Matrix.transformPoint(inv, X, Y);

  const col = snap ? Math.round(p.x) : p.x;
  const row = snap ? Math.round(p.y) : p.y;

  return { col, row };
}

export function fromGridCoords(
    col: number,
    row: number,
):{x:number, y:number}{

  const M: SimpleMatrix6 = [
    col1[0], col1[1],
    col2[0], col2[1],
    0, 0,
  ];

  return Matrix.transformPoint(M, col, row);

}
