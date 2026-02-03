const prisma = require("../config/db");
const { distanceKm } = require("../utils/geo");

exports.selectBestHospital = async (accident) => {
    const hospitals = await prisma.hospital.findMany({
        where: { beds: { gt: 0}},
    });

    if (hospitals.length === 0) {
        throw new Error("No hospitals with available beds");
    }

    let best = hospitals[0];
    let bestScore = Infinity;

    for(const h of hospitals){
        const d = distanceKm(
            accident.latitude,
            accident.longitude,
            h.latitude,
            h.longitude
        );

        const score = d - h.beds*0.01;

        if(score < bestScore){
            bestScore = score;
            best = h;
        }
    }

    return best;
};