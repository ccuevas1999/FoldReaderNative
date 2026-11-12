"""Generate an original, short paper-rustle WAV for offline page turns."""
from pathlib import Path
import math, random, wave, struct, sys
out=Path(sys.argv[1]);out.parent.mkdir(parents=True, exist_ok=True)
rate=22050;duration=.32;n=int(rate*duration);r=random.Random(20261111)
# Two soft paper swishes, each with a high frequency texture and a decaying tail.
noise=[r.uniform(-1,1) for _ in range(n)];low=0.0;data=[]
for i,x in enumerate(noise):
    t=i/rate;low=.73*low+.27*x
    env=(math.sin(math.pi*min(1,t/.21))**1.4 if t<.21 else math.exp(-(t-.21)*19))
    wavelet=(.62*x+.38*low)*(.72+.28*math.sin(2*math.pi*19*t))
    flutter=(.7+.3*math.cos(2*math.pi*7*t)**2)
    v=.27*env*flutter*wavelet
    data.append(max(-32767,min(32767,int(v*32767))))
with wave.open(str(out),'wb') as w:
    w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate)
    w.writeframes(struct.pack('<%dh'%n,*data))
print(out, out.stat().st_size)